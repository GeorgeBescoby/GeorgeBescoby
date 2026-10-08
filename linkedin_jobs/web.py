"""Local web UI: search LinkedIn jobs and view results in a table.

Run with: python -m linkedin_jobs serve
"""

import json
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import db, scraper

STATIC = Path(__file__).parent / "static"


def make_handler(db_path: str, client: scraper.Client):
    lock = threading.Lock()  # one LinkedIn request at a time, shared rate limit

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def _json(self, payload, status=200):
            body = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            url = urlparse(self.path)
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            try:
                if url.path == "/":
                    body = (STATIC / "index.html").read_bytes()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                elif url.path == "/api/search":
                    self._json(self.search(q))
                elif url.path.startswith("/api/job/"):
                    self._json(self.job(url.path.rsplit("/", 1)[-1]))
                else:
                    self._json({"error": "not found"}, 404)
            except Exception as e:  # surface errors to the UI instead of a dropped connection
                self._json({"error": str(e)}, 500)

        def search(self, q):
            """Fetch one page (10 jobs) of a live search; the UI calls this repeatedly."""
            split = lambda key: [v for v in q.get(key, "").split(",") if v]
            params = scraper.SearchParams(
                keywords=q.get("keywords", ""), location=q.get("location", ""),
                time_posted=q.get("time_posted") or None, job_types=split("job_types"),
                workplace=split("workplace"), experience=split("experience"),
            )
            start = int(q.get("start", 0))
            with lock:
                html = client.get(scraper.SEARCH_URL, {**params.to_query(), "start": start})
            cards = scraper.parse_search_page(html) if html else []
            conn = db.connect(db_path)
            try:
                for card in cards:
                    db.upsert_card(conn, card, params.label())
                conn.commit()
            finally:
                conn.close()
            return {"jobs": cards, "done": len(cards) < scraper.PAGE_SIZE}

        def job(self, job_id):
            if not job_id.isdigit():
                return {"error": "bad id"}
            conn = db.connect(db_path)
            try:
                row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
                if row is None or row["detail_fetched_at"] is None:
                    with lock:
                        detail = scraper.fetch_detail(client, job_id)
                    if detail is None:
                        return {"error": "This posting is no longer available."}
                    if row is not None:
                        db.update_detail(conn, job_id, detail)
                        conn.commit()
                    else:
                        return detail
                    row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
                return dict(row)
            finally:
                conn.close()

    return Handler


def serve(db_path: str, client: scraper.Client, host: str, port: int, open_browser: bool):
    server = ThreadingHTTPServer((host, port), make_handler(db_path, client))
    url = f"http://{'localhost' if host in ('0.0.0.0', '127.0.0.1') else host}:{port}"
    print(f"Job search running at {url}  (Ctrl+C to stop)")
    if open_browser:
        threading.Timer(0.5, webbrowser.open, [url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
