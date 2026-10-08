"""Command-line interface: python -m linkedin_jobs <command> ..."""

import argparse
import csv
import json
import sys

from . import db, scraper


def _csv_list(choices):
    def parse(value):
        items = [v.strip() for v in value.split(",") if v.strip()]
        bad = [i for i in items if i not in choices]
        if bad:
            raise argparse.ArgumentTypeError(f"invalid: {bad}; choose from {sorted(choices)}")
        return items
    return parse


def run_search(conn, client, params: scraper.SearchParams, max_jobs: int, details: bool) -> None:
    label = params.label()
    print(f"Searching: {label}")
    new = total = 0
    for card in scraper.search(client, params, max_jobs):
        total += 1
        if db.upsert_card(conn, card, label):
            new += 1
        if details:
            row = conn.execute("SELECT detail_fetched_at FROM jobs WHERE job_id = ?",
                               (card["job_id"],)).fetchone()
            if row["detail_fetched_at"] is None:
                detail = scraper.fetch_detail(client, card["job_id"])
                if detail:
                    db.update_detail(conn, card["job_id"], detail)
        conn.commit()
        print(f"  [{total}] {card['title']} - {card['company']} ({card['location']})")
    print(f"Done: {total} jobs found, {new} new")


def cmd_scrape(args, conn, client):
    if args.config:
        with open(args.config) as f:
            searches = json.load(f)
        for s in searches:
            params = scraper.SearchParams(
                keywords=s.get("keywords", ""), location=s.get("location", ""),
                time_posted=s.get("time_posted"), job_types=s.get("job_types", []),
                workplace=s.get("workplace", []), experience=s.get("experience", []),
            )
            run_search(conn, client, params, s.get("max_jobs", args.max_jobs), args.details)
    else:
        params = scraper.SearchParams(
            keywords=args.keywords, location=args.location, time_posted=args.time_posted,
            job_types=args.job_type or [], workplace=args.workplace or [],
            experience=args.experience or [],
        )
        run_search(conn, client, params, args.max_jobs, args.details)


def cmd_details(args, conn, client):
    ids = db.jobs_missing_detail(conn, args.limit)
    print(f"Fetching details for {len(ids)} jobs")
    for i, job_id in enumerate(ids, 1):
        detail = scraper.fetch_detail(client, job_id)
        if detail:
            db.update_detail(conn, job_id, detail)
        else:
            # Posting removed; mark as fetched so we don't retry forever.
            conn.execute("UPDATE jobs SET detail_fetched_at = ? WHERE job_id = ?", (db.now(), job_id))
        conn.commit()
        print(f"  [{i}/{len(ids)}] {job_id} {'ok' if detail else 'gone'}")


def cmd_export(args, conn, _client):
    rows = [dict(r) for r in conn.execute("SELECT * FROM jobs ORDER BY posted_date DESC")]
    if not args.html:
        for r in rows:
            r.pop("description_html", None)
    out = open(args.output, "w", newline="") if args.output else sys.stdout
    with out:
        if args.format == "json":
            json.dump(rows, out, indent=2, ensure_ascii=False)
        elif rows:
            writer = csv.DictWriter(out, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
    if args.output:
        print(f"Exported {len(rows)} jobs to {args.output}")


def cmd_stats(_args, conn, _client):
    q = lambda sql: conn.execute(sql).fetchall()
    total = q("SELECT COUNT(*) c FROM jobs")[0]["c"]
    detailed = q("SELECT COUNT(*) c FROM jobs WHERE description IS NOT NULL")[0]["c"]
    print(f"Jobs: {total} ({detailed} with full details)\n\nBy search:")
    for r in q("SELECT search, COUNT(*) c FROM search_hits GROUP BY search ORDER BY c DESC"):
        print(f"  {r['c']:5}  {r['search']}")
    print("\nTop companies:")
    for r in q("SELECT company, COUNT(*) c FROM jobs GROUP BY company ORDER BY c DESC LIMIT 15"):
        print(f"  {r['c']:5}  {r['company']}")


def main(argv=None):
    p = argparse.ArgumentParser(prog="linkedin_jobs", description="Build a job database from LinkedIn's public job listings.")
    p.add_argument("--db", default="jobs.db", help="SQLite database path (default: jobs.db)")
    p.add_argument("--min-delay", type=float, default=2.0, help="min seconds between requests")
    p.add_argument("--max-delay", type=float, default=5.0, help="max seconds between requests")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("scrape", help="run a search and store results")
    s.add_argument("-k", "--keywords", default="")
    s.add_argument("-l", "--location", default="")
    s.add_argument("-n", "--max-jobs", type=int, default=100)
    s.add_argument("--time-posted", choices=list(scraper.TIME_POSTED))
    s.add_argument("--job-type", type=_csv_list(scraper.JOB_TYPES), help="e.g. full-time,contract")
    s.add_argument("--workplace", type=_csv_list(scraper.WORKPLACE), help="e.g. remote,hybrid")
    s.add_argument("--experience", type=_csv_list(scraper.EXPERIENCE), help="e.g. entry,mid-senior")
    s.add_argument("--details", action="store_true", help="also fetch full description for each new job")
    s.add_argument("--config", help="JSON file with a list of searches (overrides other search flags)")
    s.set_defaults(func=cmd_scrape)

    d = sub.add_parser("details", help="fetch full details for jobs that don't have them yet")
    d.add_argument("--limit", type=int)
    d.set_defaults(func=cmd_details)

    e = sub.add_parser("export", help="export jobs to CSV or JSON")
    e.add_argument("-f", "--format", choices=["csv", "json"], default="csv")
    e.add_argument("-o", "--output")
    e.add_argument("--html", action="store_true", help="include description_html column")
    e.set_defaults(func=cmd_export)

    st = sub.add_parser("stats", help="summary of the database")
    st.set_defaults(func=cmd_stats)

    args = p.parse_args(argv)
    conn = db.connect(args.db)
    client = scraper.Client(args.min_delay, args.max_delay)
    try:
        args.func(args, conn, client)
    except KeyboardInterrupt:
        conn.commit()
        print("\nInterrupted; progress saved.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
