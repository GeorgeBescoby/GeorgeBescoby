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


@dataclass
class PhoneNumber:
    raw: str
    digits: str       # full digits with country code, no +
    country: str      # "US" or "UK"
    formatted: str    # human-readable


def normalize_number(raw: str) -> PhoneNumber:
    """Parse a US or UK phone number into a PhoneNumber."""
    digits = re.sub(r"\D", "", raw)

    # UK: +44 or 44 prefix, or 07xxx (11 digits starting 07)
    if raw.strip().startswith("+44") or digits.startswith("44"):
        if digits.startswith("44"):
            digits = digits  # already has country code
        # Ensure leading 44
        if not digits.startswith("44"):
            raise ValueError(f"Could not parse UK number: {raw!r}")
        local = digits[2:]  # strip country code -> 10 digits starting 7
        if len(local) != 10:
            raise ValueError(f"UK number must be 10 digits after country code: {raw!r}")
        formatted = f"+44 {local[:4]} {local[4:]}"
        return PhoneNumber(raw, digits, "UK", formatted)

    # UK local format: 07xxx xxxxxxx (11 digits starting 07)
    if len(digits) == 11 and digits.startswith("07"):
        local = digits[1:]  # strip leading 0 -> 7xxxxxxxxx
        digits = "44" + local
        formatted = f"+44 {local[:4]} {local[4:]}"
        return PhoneNumber(raw, digits, "UK", formatted)

    # US: 10 digits or 11 digits starting with 1
    if len(digits) == 10:
        digits = "1" + digits
    if len(digits) == 11 and digits[0] == "1":
        d = digits[1:]
        formatted = f"+1 ({d[:3]}) {d[3:6]}-{d[6:]}"
        return PhoneNumber(raw, digits, "US", formatted)

    raise ValueError(
        f"Unrecognised number: {raw!r}. Supported formats: US (10/11 digits) "
        "or UK (+44 / 07xxx)."
    )


def _get(url: str, timeout: int = 10) -> requests.Response | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Source scrapers — US
# ---------------------------------------------------------------------------

def check_800notes(p: PhoneNumber) -> SourceResult:
    local = p.digits[1:]  # 10-digit
    url = f"https://800notes.com/Phone.aspx/1-{local[:3]}-{local[3:6]}-{local[6:]}"
    r = _get(url)
    name = "800notes.com"
    if r is None:
        return SourceResult(name, False, 0.0, 0, "unreachable", url)

    soup = BeautifulSoup(r.text, "html.parser")

    count = 0
    count_el = soup.find("span", {"id": "ctl00_ContentPlaceHolder1_lblCount"})
    if count_el:
        m = re.search(r"\d+", count_el.get_text())
        if m:
            count = int(m.group())

    rating = 0.0
    rating_el = soup.find("span", {"itemprop": "ratingValue"})
    if rating_el:
        try:
            rating = float(rating_el.get_text().strip())
        except ValueError:
            pass

    if count == 0:
        return SourceResult(name, False, 0.0, 0, "no reports", url)

    spam_score = max(0.0, (rating - 1) / 4) if rating else 0.5
    label = f"{count} reports, avg rating {rating:.1f}/5"
    return SourceResult(name, True, spam_score, count, label, url)


def check_shouldianswer_us(p: PhoneNumber) -> SourceResult:
    local = p.digits[1:]
    url = f"https://www.shouldianswer.com/phone-number/{local[:3]}-{local[3:6]}-{local[6:]}"
    return _shouldianswer(url)


def check_spamcalls(p: PhoneNumber) -> SourceResult:
    local = p.digits[1:]
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


def check_nomorobo(p: PhoneNumber) -> SourceResult:
    local = p.digits[1:]
    url = f"https://www.nomorobo.com/lookup/{local[:3]}-{local[3:6]}-{local[6:]}"
    r = _get(url)
    name = "nomorobo.com"
    if r is None:
        return SourceResult(name, False, 0.0, 0, "unreachable", url)

    soup = BeautifulSoup(r.text, "html.parser")
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


# ---------------------------------------------------------------------------
# Source scrapers — UK
# ---------------------------------------------------------------------------

def _shouldianswer(url: str) -> SourceResult:
    """Shared logic for shouldianswer.com (works for both US and UK URLs)."""
    r = _get(url)
    name = "shouldianswer.com"
    if r is None:
        return SourceResult(name, False, 0.0, 0, "unreachable", url)

    soup = BeautifulSoup(r.text, "html.parser")

    badge = ""
    badge_el = soup.find("span", class_=re.compile(r"badge|rating", re.I))
    if badge_el:
        badge = badge_el.get_text(strip=True).upper()

    count = 0
    for el in soup.find_all(string=re.compile(r"comment|report", re.I)):
        m = re.search(r"(\d+)\s+(comment|report)", el, re.I)
        if m:
            count = int(m.group(1))
            break

    score_map = {"POSITIVE": 0.05, "NEUTRAL": 0.35, "NEGATIVE": 0.75, "DANGEROUS": 0.95}
    spam_score = score_map.get(badge, 0.0 if count == 0 else 0.4)
    label = badge if badge else ("no reports" if count == 0 else f"{count} reports")
    return SourceResult(name, bool(badge or count), spam_score, count, label, url)


def check_shouldianswer_uk(p: PhoneNumber) -> SourceResult:
    local = p.digits[2:]  # strip 44 -> 10 digits starting with 7
    # shouldianswer.co.uk uses 07xxx format
    number_str = "0" + local
    url = f"https://www.shouldianswer.co.uk/phone-number/{number_str}"
    return _shouldianswer(url)


def check_whocalleduk(p: PhoneNumber) -> SourceResult:
    local = p.digits[2:]  # strip 44
    number_str = "0" + local
    url = f"https://who-called.co.uk/number/{number_str}"
    r = _get(url)
    name = "who-called.co.uk"
    if r is None:
        return SourceResult(name, False, 0.0, 0, "unreachable", url)

    soup = BeautifulSoup(r.text, "html.parser")
    text = soup.get_text(" ", strip=True)

    count = 0
    m = re.search(r"(\d+)\s+(comment|report|call)", text, re.I)
    if m:
        count = int(m.group(1))

    # Look for danger rating badge
    danger = ""
    for el in soup.find_all(class_=re.compile(r"label|badge|rating|danger", re.I)):
        t = el.get_text(strip=True).upper()
        if t in ("SAFE", "NEUTRAL", "UNSAFE", "DANGEROUS", "SPAM", "SCAM"):
            danger = t
            break

    danger_map = {"SAFE": 0.05, "NEUTRAL": 0.3, "UNSAFE": 0.75, "DANGEROUS": 0.9,
                  "SPAM": 0.85, "SCAM": 0.95}
    spam_score = danger_map.get(danger, 0.5 if count > 0 else 0.0)
    label = f"{danger}, {count} reports" if danger else (
        f"{count} reports" if count else "no reports"
    )
    return SourceResult(name, count > 0 or bool(danger), spam_score, count, label, url)


def check_ofcom_uk(p: PhoneNumber) -> SourceResult:
    """Check UK phone number type via Ofcom's number checker (flags non-geographic/premium numbers)."""
    local = p.digits[2:]  # strip 44 -> 10 digits starting 7
    number_str = "0" + local
    url = f"https://checker.ofcom.org.uk/en-gb/phone-checker?number={number_str}"
    r = _get(url)
    name = "ofcom.org.uk"
    if r is None:
        return SourceResult(name, False, 0.0, 0, "unreachable", url)

    text = r.text.upper()
    # Ofcom labels premium/non-geographic numbers which are commonly used for spam
    is_premium = "PREMIUM" in text or "09" in number_str[:2]
    is_mobile = number_str.startswith("07")
    is_geographic = "GEOGRAPHIC" in text

    if is_premium:
        spam_score, label = 0.7, "premium rate number (high spam risk)"
    elif is_mobile:
        spam_score, label = 0.1, "mobile number (low inherent risk)"
    elif is_geographic:
        spam_score, label = 0.05, "geographic number"
    else:
        spam_score, label = 0.3, "non-geographic number"

    return SourceResult(name, True, spam_score, 0, label, url)


def check_spamcalls_uk(p: PhoneNumber) -> SourceResult:
    local = p.digits[2:]  # strip 44
    number_str = "0" + local
    url = f"https://spamcalls.net/en/number/{number_str.replace('-', '')}"
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


US_SOURCES = [check_800notes, check_shouldianswer_us, check_spamcalls, check_nomorobo]
UK_SOURCES = [check_shouldianswer_uk, check_whocalleduk, check_spamcalls_uk, check_ofcom_uk]


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
    print("  reports. Carrier-level spam flags are proprietary and")
    print("  cannot be read without a paid business API.")
    print("=" * 56)
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Check if a phone number is likely flagged as spam. Supports US and UK numbers."
    )
    parser.add_argument("number", nargs="+", help="Phone number(s) to check")
    parser.add_argument("--delay", type=float, default=1.5,
                        help="Seconds between source requests (default: 1.5)")
    args = parser.parse_args()

    for raw in args.number:
        try:
            p = normalize_number(raw)
        except ValueError as e:
            print(f"Error: {e}")
            continue

        sources = UK_SOURCES if p.country == "UK" else US_SOURCES
        results: list[SourceResult] = []
        for checker in sources:
            res = checker(p)
            results.append(res)
            time.sleep(args.delay)

        score, verdict = aggregate(results)
        print_report(p.formatted, results, score, verdict)


if __name__ == "__main__":
    main()
