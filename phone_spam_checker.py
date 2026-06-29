#!/usr/bin/env python3
"""
Phone Spam Likelihood Checker
Queries public spam databases to estimate whether a phone number
will show a "Likely Spam" label when calling cold numbers.
"""

import re
import sys
import time
import argparse
from dataclasses import dataclass

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Missing dependencies. Run: pip install requests beautifulsoup4")
    sys.exit(1)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


@dataclass
class SourceResult:
    name: str
    found: bool          # number exists in database at all
    spam_score: float    # 0.0 = clean, 1.0 = definite spam
    report_count: int
    label: str           # human-readable label from the source
    url: str


def normalize_number(raw: str) -> tuple[str, str]:
    """Return (digits_only, formatted) e.g. ('18005551234', '1-800-555-1234')."""
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10:
        digits = "1" + digits
    if len(digits) != 11 or digits[0] != "1":
        raise ValueError(f"Invalid US phone number: {raw!r}")
    d = digits[1:]  # 10-digit local part
    formatted = f"1-{d[:3]}-{d[3:6]}-{d[6:]}"
    return digits, formatted


def _get(url: str, timeout: int = 10) -> requests.Response | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Source scrapers
# ---------------------------------------------------------------------------

def check_800notes(digits: str, formatted: str) -> SourceResult:
    local = digits[1:]  # 10-digit
    url = f"https://800notes.com/Phone.aspx/1-{local[:3]}-{local[3:6]}-{local[6:]}"
    r = _get(url)
    name = "800notes.com"
    if r is None:
        return SourceResult(name, False, 0.0, 0, "unreachable", url)

    soup = BeautifulSoup(r.text, "html.parser")

    # Report count
    count = 0
    count_el = soup.find("span", {"id": "ctl00_ContentPlaceHolder1_lblCount"})
    if count_el:
        m = re.search(r"\d+", count_el.get_text())
        if m:
            count = int(m.group())

    # Avg rating (1=safe .. 5=spam on 800notes)
    rating = 0.0
    rating_el = soup.find("span", {"itemprop": "ratingValue"})
    if rating_el:
        try:
            rating = float(rating_el.get_text().strip())
        except ValueError:
            pass

    if count == 0:
        return SourceResult(name, False, 0.0, 0, "no reports", url)

    # Normalise: 800notes rates 1 (safe) to 5 (dangerous). Map to 0–1.
    spam_score = max(0.0, (rating - 1) / 4) if rating else 0.5
    label = f"{count} reports, avg rating {rating:.1f}/5"
    return SourceResult(name, True, spam_score, count, label, url)


def check_shouldianswer(digits: str, formatted: str) -> SourceResult:
    local = digits[1:]
    url = f"https://www.shouldianswer.com/phone-number/{local[:3]}-{local[3:6]}-{local[6:]}"
    r = _get(url)
    name = "shouldianswer.com"
    if r is None:
        return SourceResult(name, False, 0.0, 0, "unreachable", url)

    soup = BeautifulSoup(r.text, "html.parser")

    # Rating badge: "POSITIVE", "NEUTRAL", "NEGATIVE", "DANGEROUS"
    badge = ""
    badge_el = soup.find("span", class_=re.compile(r"badge|rating", re.I))
    if badge_el:
        badge = badge_el.get_text(strip=True).upper()

    # Comment/report count
    count = 0
    count_els = soup.find_all(string=re.compile(r"comment|report", re.I))
    for el in count_els:
        m = re.search(r"(\d+)\s+(comment|report)", el, re.I)
        if m:
            count = int(m.group(1))
            break

    score_map = {"POSITIVE": 0.05, "NEUTRAL": 0.35, "NEGATIVE": 0.75, "DANGEROUS": 0.95}
    spam_score = score_map.get(badge, 0.0 if count == 0 else 0.4)
    label = badge if badge else ("no reports" if count == 0 else f"{count} reports")
    found = bool(badge or count)
    return SourceResult(name, found, spam_score, count, label, url)


def check_spamcalls(digits: str, formatted: str) -> SourceResult:
    local = digits[1:]
    url = f"https://spamcalls.net/en/number/{local[:3]}{local[3:6]}{local[6:]}"
    r = _get(url)
    name = "spamcalls.net"
    if r is None:
        return SourceResult(name, False, 0.0, 0, "unreachable", url)

    soup = BeautifulSoup(r.text, "html.parser")

    count = 0
    count_el = soup.find(string=re.compile(r"\d+\s+report", re.I))
    if count_el:
        m = re.search(r"(\d+)\s+report", count_el, re.I)
        if m:
            count = int(m.group(1))

    # Danger level text
    danger = ""
    danger_el = soup.find(class_=re.compile(r"danger|risk|level", re.I))
    if danger_el:
        danger = danger_el.get_text(strip=True).upper()

    danger_map = {"LOW": 0.1, "MEDIUM": 0.5, "HIGH": 0.85, "VERY HIGH": 0.95}
    spam_score = danger_map.get(danger, 0.5 if count > 0 else 0.0)
    label = f"{danger} risk, {count} reports" if danger else (
        f"{count} reports" if count else "no reports"
    )
    return SourceResult(name, count > 0, spam_score, count, label, url)


def check_nomorobo(digits: str, formatted: str) -> SourceResult:
    local = digits[1:]
    url = f"https://www.nomorobo.com/lookup/{local[:3]}-{local[3:6]}-{local[6:]}"
    r = _get(url)
    name = "nomorobo.com"
    if r is None:
        return SourceResult(name, False, 0.0, 0, "unreachable", url)

    soup = BeautifulSoup(r.text, "html.parser")

    # Nomorobo shows "Robocaller" or "Not a Robocaller" prominently
    text = soup.get_text(" ", strip=True).upper()
    is_robocaller = "ROBOCALLER" in text and "NOT A ROBOCALLER" not in text
    is_clean = "NOT A ROBOCALLER" in text

    count = 0
    m = re.search(r"(\d[\d,]*)\s+report", text, re.I)
    if m:
        count = int(m.group(1).replace(",", ""))

    if is_robocaller:
        spam_score, label = 0.9, f"flagged as robocaller ({count} reports)"
    elif is_clean:
        spam_score, label = 0.05, "not a robocaller"
    else:
        spam_score, label = 0.0, "not in database"

    return SourceResult(name, is_robocaller or is_clean, spam_score, count, label, url)


SOURCES = [check_800notes, check_shouldianswer, check_spamcalls, check_nomorobo]


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def aggregate(results: list[SourceResult]) -> tuple[float, str]:
    """Weighted average of sources that returned data."""
    active = [r for r in results if r.found]
    if not active:
        return 0.0, "UNKNOWN"

    # Weight sources with more reports more heavily
    total_weight = sum(max(1, r.report_count) for r in active)
    weighted_score = sum(r.spam_score * max(1, r.report_count) for r in active)
    score = weighted_score / total_weight

    if score >= 0.75:
        verdict = "VERY LIKELY SPAM"
    elif score >= 0.50:
        verdict = "LIKELY SPAM"
    elif score >= 0.25:
        verdict = "POSSIBLY SPAM"
    elif score > 0.0:
        verdict = "PROBABLY CLEAN"
    else:
        verdict = "CLEAN / NO DATA"

    return score, verdict


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------

BAR_WIDTH = 30

def render_bar(score: float) -> str:
    filled = round(score * BAR_WIDTH)
    bar = "█" * filled + "░" * (BAR_WIDTH - filled)
    pct = int(score * 100)
    return f"[{bar}] {pct}%"


VERDICT_COLOR = {
    "VERY LIKELY SPAM": "\033[91m",   # red
    "LIKELY SPAM":      "\033[91m",
    "POSSIBLY SPAM":    "\033[93m",   # yellow
    "PROBABLY CLEAN":   "\033[92m",   # green
    "CLEAN / NO DATA":  "\033[92m",
    "UNKNOWN":          "\033[90m",   # grey
}
RESET = "\033[0m"


def print_report(number_raw: str, results: list[SourceResult], score: float, verdict: str) -> None:
    color = VERDICT_COLOR.get(verdict, "")
    print()
    print("=" * 56)
    print(f"  Phone Spam Check: {number_raw}")
    print("=" * 56)
    print(f"\n  Overall likelihood: {color}{verdict}{RESET}")
    print(f"  Spam score:         {render_bar(score)}")
    print()
    print("  Sources:")
    for r in results:
        status = "✓" if r.found else "–"
        print(f"    {status} {r.name:<24} {r.label}")
        print(f"      └─ {r.url}")
    print()
    print("  NOTE: This is an estimate based on public crowd-sourced")
    print("  reports. Carrier spam flags (Hiya, First Orion, TNS)")
    print("  are proprietary and cannot be read without a paid API.")
    print("=" * 56)
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Check if a phone number is likely flagged as spam."
    )
    parser.add_argument("number", nargs="+", help="Phone number(s) to check (US only)")
    parser.add_argument("--delay", type=float, default=1.5,
                        help="Seconds between source requests (default: 1.5)")
    args = parser.parse_args()

    for raw in args.number:
        try:
            digits, formatted = normalize_number(raw)
        except ValueError as e:
            print(f"Error: {e}")
            continue

        results: list[SourceResult] = []
        for checker in SOURCES:
            res = checker(digits, formatted)
            results.append(res)
            time.sleep(args.delay)

        score, verdict = aggregate(results)
        print_report(raw, results, score, verdict)


if __name__ == "__main__":
    main()
