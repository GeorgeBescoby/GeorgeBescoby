"""Fetch and parse LinkedIn's public (logged-out) job search pages.

No credentials are used: these are the same pages LinkedIn serves to anyone
browsing jobs without signing in. Requests are rate limited and back off on
HTTP 429 so the scraper stays polite.
"""

import random
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
DETAIL_URL = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"
PAGE_SIZE = 10  # the guest endpoint returns 10 cards per page

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# LinkedIn URL filter codes
TIME_POSTED = {"24h": "r86400", "week": "r604800", "month": "r2592000"}
JOB_TYPES = {"full-time": "F", "part-time": "P", "contract": "C",
             "temporary": "T", "internship": "I", "volunteer": "V", "other": "O"}
WORKPLACE = {"on-site": "1", "remote": "2", "hybrid": "3"}
EXPERIENCE = {"internship": "1", "entry": "2", "associate": "3",
              "mid-senior": "4", "director": "5", "executive": "6"}


@dataclass
class SearchParams:
    keywords: str = ""
    location: str = ""
    time_posted: str | None = None      # key of TIME_POSTED
    job_types: list[str] = field(default_factory=list)
    workplace: list[str] = field(default_factory=list)
    experience: list[str] = field(default_factory=list)
    sort_recent: bool = True

    def to_query(self) -> dict:
        q = {"keywords": self.keywords, "location": self.location}
        if self.time_posted:
            q["f_TPR"] = TIME_POSTED[self.time_posted]
        if self.job_types:
            q["f_JT"] = ",".join(JOB_TYPES[j] for j in self.job_types)
        if self.workplace:
            q["f_WT"] = ",".join(WORKPLACE[w] for w in self.workplace)
        if self.experience:
            q["f_E"] = ",".join(EXPERIENCE[e] for e in self.experience)
        if self.sort_recent:
            q["sortBy"] = "DD"
        return q

    def label(self) -> str:
        return f"{self.keywords or '*'} @ {self.location or 'anywhere'}"


class Client:
    def __init__(self, min_delay: float = 2.0, max_delay: float = 5.0, max_retries: int = 4):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-GB,en;q=0.9"})
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.max_retries = max_retries
        self._last = 0.0

    def get(self, url: str, params: dict | None = None) -> str | None:
        """GET with a polite delay between requests and backoff on 429/5xx.

        Returns the response body, or None for 400/404 (no more results /
        posting removed).
        """
        for attempt in range(self.max_retries + 1):
            wait = random.uniform(self.min_delay, self.max_delay) - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            resp = self.session.get(url, params=params, timeout=30)
            if resp.status_code == 200:
                return resp.text
            if resp.status_code in (400, 404):
                return None
            if resp.status_code == 429 or resp.status_code >= 500:
                backoff = 30 * (2 ** attempt)
                print(f"  HTTP {resp.status_code}, backing off {backoff}s")
                time.sleep(backoff)
                continue
            resp.raise_for_status()
        raise RuntimeError(f"Gave up on {url} after {self.max_retries} retries")


def _text(el) -> str | None:
    if el is None:
        return None
    t = " ".join(el.get_text(" ", strip=True).split())
    return t or None


def _clean_url(url: str | None) -> str | None:
    return url.split("?")[0] if url else None


def parse_search_page(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    jobs = []
    for card in soup.select("div.base-card[data-entity-urn]"):
        m = re.search(r"jobPosting:(\d+)", card["data-entity-urn"])
        if not m:
            continue
        link = card.select_one("a.base-card__full-link")
        company_link = card.select_one("h4.base-search-card__subtitle a")
        posted = card.select_one("time")
        jobs.append({
            "job_id": m.group(1),
            "title": _text(card.select_one("h3.base-search-card__title")),
            "company": _text(card.select_one("h4.base-search-card__subtitle")),
            "company_url": _clean_url(company_link.get("href") if company_link else None),
            "location": _text(card.select_one("span.job-search-card__location")),
            "salary": _text(card.select_one("span.job-search-card__salary-info")),
            "posted_date": posted.get("datetime") if posted else None,
            "url": _clean_url(link.get("href") if link else None),
        })
    return jobs


def parse_job_detail(html: str) -> dict:
    soup = BeautifulSoup(html, "lxml")
    criteria = {}
    for li in soup.select("li.description__job-criteria-item"):
        key, val = _text(li.select_one("h3")), _text(li.select_one("span"))
        if key:
            criteria[key.lower()] = val

    desc_el = soup.select_one("div.show-more-less-html__markup")
    applicants = _text(soup.select_one(".num-applicants__caption"))
    apply_url = None
    apply_code = soup.select_one("code#applyUrl")
    if apply_code:
        m = re.search(r'"(https?://[^"]+)"', apply_code.decode_contents())
        apply_url = m.group(1) if m else None

    return {
        "description": desc_el.get_text("\n", strip=True) if desc_el else None,
        "description_html": desc_el.decode_contents().strip() if desc_el else None,
        "seniority": criteria.get("seniority level"),
        "employment_type": criteria.get("employment type"),
        "job_function": criteria.get("job function"),
        "industries": criteria.get("industries"),
        "applicants": applicants,
        "salary_detail": _text(soup.select_one("div.compensation__salary")),
        "apply_url": apply_url,
        "detail_fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def search(client: Client, params: SearchParams, max_jobs: int = 100):
    """Yield job cards for a search, paging until max_jobs or results run out."""
    seen = 0
    for start in range(0, max_jobs, PAGE_SIZE):
        html = client.get(SEARCH_URL, {**params.to_query(), "start": start})
        if not html:
            return
        cards = parse_search_page(html)
        if not cards:
            return
        for card in cards:
            yield card
            seen += 1
            if seen >= max_jobs:
                return


def fetch_detail(client: Client, job_id: str) -> dict | None:
    html = client.get(DETAIL_URL.format(job_id=job_id))
    return parse_job_detail(html) if html else None
