"""SQLite storage for scraped jobs."""

import sqlite3
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    job_id            TEXT PRIMARY KEY,
    title             TEXT,
    company           TEXT,
    company_url       TEXT,
    location          TEXT,
    salary            TEXT,
    posted_date       TEXT,
    url               TEXT,
    apply_url         TEXT,
    seniority         TEXT,
    employment_type   TEXT,
    job_function      TEXT,
    industries        TEXT,
    applicants        TEXT,
    description       TEXT,
    description_html  TEXT,
    first_seen        TEXT NOT NULL,
    last_seen         TEXT NOT NULL,
    detail_fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS search_hits (
    job_id     TEXT NOT NULL REFERENCES jobs(job_id),
    search     TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen  TEXT NOT NULL,
    PRIMARY KEY (job_id, search)
);

CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_posted ON jobs(posted_date);
"""

CARD_FIELDS = ["title", "company", "company_url", "location", "salary", "posted_date", "url"]
DETAIL_FIELDS = ["description", "description_html", "seniority", "employment_type",
                 "job_function", "industries", "applicants", "apply_url", "detail_fetched_at"]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def upsert_card(conn: sqlite3.Connection, card: dict, search: str) -> bool:
    """Insert or refresh a job from a search card. Returns True if the job is new."""
    ts = now()
    is_new = conn.execute("SELECT 1 FROM jobs WHERE job_id = ?", (card["job_id"],)).fetchone() is None
    cols = ", ".join(CARD_FIELDS)
    placeholders = ", ".join("?" for _ in CARD_FIELDS)
    # Keep existing values when the card omits a field (e.g. salary not shown this time).
    updates = ", ".join(f"{c} = COALESCE(excluded.{c}, {c})" for c in CARD_FIELDS)
    conn.execute(
        f"INSERT INTO jobs (job_id, {cols}, first_seen, last_seen) VALUES (?, {placeholders}, ?, ?) "
        f"ON CONFLICT(job_id) DO UPDATE SET {updates}, last_seen = excluded.last_seen",
        [card["job_id"], *(card.get(c) for c in CARD_FIELDS), ts, ts],
    )
    conn.execute(
        "INSERT INTO search_hits (job_id, search, first_seen, last_seen) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(job_id, search) DO UPDATE SET last_seen = excluded.last_seen",
        (card["job_id"], search, ts, ts),
    )
    return is_new


def update_detail(conn: sqlite3.Connection, job_id: str, detail: dict) -> None:
    detail = dict(detail)
    # The detail page's salary is more complete than the card's when present.
    salary = detail.pop("salary_detail", None)
    sets = ", ".join(f"{c} = ?" for c in DETAIL_FIELDS)
    conn.execute(
        f"UPDATE jobs SET {sets}, salary = COALESCE(?, salary) WHERE job_id = ?",
        [*(detail.get(c) for c in DETAIL_FIELDS), salary, job_id],
    )


def jobs_missing_detail(conn: sqlite3.Connection, limit: int | None = None) -> list[str]:
    sql = "SELECT job_id FROM jobs WHERE detail_fetched_at IS NULL ORDER BY first_seen DESC"
    if limit:
        sql += f" LIMIT {int(limit)}"
    return [r["job_id"] for r in conn.execute(sql)]
