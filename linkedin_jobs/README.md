# LinkedIn Jobs → SQLite

Builds a local job database from LinkedIn's **public, logged-out** job listings
(the same pages anyone can view without signing in). No LinkedIn account or
credentials are used.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

```bash
# One search, with full descriptions
python -m linkedin_jobs scrape -k "marketing manager" -l "United Kingdom" \
    --time-posted week --workplace remote,hybrid -n 200 --details

# Many searches from a config file (see searches.example.json)
python -m linkedin_jobs scrape --config searches.example.json --details

# Fill in descriptions later for jobs scraped without --details
python -m linkedin_jobs details

# Summary / export
python -m linkedin_jobs stats
python -m linkedin_jobs export -f csv -o jobs.csv
python -m linkedin_jobs export -f json -o jobs.json
```

Use `--db path/to/file.db` (before the command) to choose the database file
(default `jobs.db`).

### Filters

| Flag | Values |
|---|---|
| `--time-posted` | `24h`, `week`, `month` |
| `--job-type` | `full-time`, `part-time`, `contract`, `temporary`, `internship`, `volunteer`, `other` |
| `--workplace` | `on-site`, `remote`, `hybrid` |
| `--experience` | `internship`, `entry`, `associate`, `mid-senior`, `director`, `executive` |

Comma-separate multiple values, e.g. `--workplace remote,hybrid`.

## What's stored

Table `jobs` (one row per LinkedIn job ID): title, company, company URL,
location, salary (when shown), posted date, job URL, apply URL (when it's an
external apply link), seniority, employment type, job function, industries,
applicant count, description (text + HTML), and `first_seen` / `last_seen`
timestamps.

Table `search_hits` records which search found each job and when, so re-running
the same searches over time shows you which listings are new and which have
dropped off.

Re-running is safe: existing jobs are updated, not duplicated.

## Notes

- **Limits:** LinkedIn's public search stops paging at roughly 1,000 results
  per query. Use narrower searches (by location or filters) to get more.
- **Rate limiting:** requests are spaced 2–5s apart by default
  (`--min-delay` / `--max-delay`), and the scraper backs off automatically on
  HTTP 429. Keep it gentle; hammering the endpoint will get your IP
  temporarily blocked.
- **Fragility:** this parses LinkedIn's HTML. If they change their markup, the
  selectors in `scraper.py` may need updating.
- **Terms:** LinkedIn's User Agreement prohibits automated collection, even of
  public pages. Personal-scale use of public job listings is low risk, but
  don't resell the data or run it at industrial scale.
