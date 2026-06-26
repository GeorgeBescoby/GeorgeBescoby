#!/usr/bin/env python3
"""
Scrapes LinkedIn for Marketing Analyst roles mentioning 'reporting' at
ecommerce / DTC companies, then verifies each company runs on Shopify.
Outputs: shopify_marketing_analyst_jobs.csv
"""

import csv
import os
import re
import time
import random
from pathlib import Path
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

# ── Config ───────────────────────────────────────────────────────────────────

OUTPUT_FILE  = Path('/home/user/GeorgeBescoby/shopify_marketing_analyst_jobs.csv')
PROXY_SERVER = os.environ.get('HTTPS_PROXY', 'http://127.0.0.1:38987')
CA_BUNDLE    = '/root/.ccr/ca-bundle.crt'
PROXIES      = {'https': PROXY_SERVER, 'http': PROXY_SERVER}

SHOPIFY_HTML_SIGNALS = [
    'cdn.shopify.com',
    'myshopify.com',
    'window.Shopify',
    '/cdn/shop/',
    'ShopifyAnalytics',
    'Shopify.theme',
    '"shop_id"',
    'shopify-features',
    'Shopify.locale',
]

COMPANY_SUFFIXES = re.compile(
    r'\b(inc\.?|incorporated|llc\.?|ltd\.?|limited|corp\.?|corporation|'
    r'co\.?|group|holdings|holding|international|global|'
    r'north america|usa|us|the|&|and|brands?|enterprises?|'
    r'industries|industry|manufacturing|products?|solutions?|'
    r'services?|systems?|technologies|technology|tech)\b',
    flags=re.I,
)

# Obvious non-ecommerce sectors — skip without checking
NON_ECOMMERCE = re.compile(
    r'\b(bank|credit union|insurance|financial|mortgage|recruiting|'
    r'staffing|consulting|bakeries|cement|concrete|coatings|petroleum|'
    r'crude oil|natural gas|energy|mining|aerospace|defense|'
    r'healthcare|hospital|pharma|law firm|legal|accounting|'
    r'freight|logistics|trucking|railroad|telecom|broadband)\b',
    flags=re.I,
)

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

LI_HEADERS = {**HEADERS, 'Referer': 'https://www.linkedin.com/'}

# ── HTTP helpers ─────────────────────────────────────────────────────────────

def get(url: str, extra: dict | None = None, timeout: int = 20) -> requests.Response:
    h = {**HEADERS, **(extra or {})}
    return requests.get(url, headers=h, proxies=PROXIES,
                        verify=CA_BUNDLE, timeout=timeout, allow_redirects=True)


def head(url: str, timeout: int = 8) -> requests.Response | None:
    try:
        return requests.head(url, headers=HEADERS, proxies=PROXIES,
                             verify=CA_BUNDLE, timeout=timeout, allow_redirects=True)
    except Exception:
        return None

# ── Shopify detection ────────────────────────────────────────────────────────

def _slugs(company: str) -> list[str]:
    cleaned   = COMPANY_SUFFIXES.sub('', company)
    cleaned   = re.sub(r'[^\w\s-]', '', cleaned).strip()
    no_spaces = re.sub(r'[\s_]+', '',  cleaned).lower()
    hyphen    = re.sub(r'[\s_]+', '-', cleaned).lower()
    out = []
    for s in [no_spaces, hyphen]:
        if s and s not in out:
            out.append(s)
    return out


def _shopify_via_myshopify(slug: str, company: str) -> bool:
    """
    True if slug.myshopify.com resolves (2xx/3xx) AND the store content
    actually belongs to the company we're looking for.
    """
    r = head(f'https://{slug}.myshopify.com')
    if r is None or r.status_code >= 400:
        return False

    final_url = r.url.lower()

    # If the slug redirected to a custom domain, that domain should contain
    # at least one significant word from the company name
    company_words = [
        w.lower() for w in re.split(r'[\s\W]+', company)
        if len(w) >= 4 and w.lower() not in
        {'inc', 'llc', 'ltd', 'corp', 'group', 'brands', 'holdings',
         'international', 'global', 'north', 'america', 'company', 'the'}
    ]

    if not company_words:
        return True  # can't validate, allow through

    DEMO_MARKERS = ('demostore', 'demo store', ' demo-', 'test store',
                    'development store', 'sample store')

    if 'myshopify.com' in final_url:
        # Didn't redirect to a custom domain — fetch and validate
        try:
            page = get(f'https://{slug}.myshopify.com', timeout=10)
            text_lower = page.text[:3000].lower()

            # Reject demo/test stores
            if any(m in text_lower for m in DEMO_MARKERS):
                return False

            return any(w in text_lower for w in company_words)
        except Exception:
            return any(w in slug for w in company_words)
    else:
        # Redirected to a custom domain — require the domain to start with the slug
        from urllib.parse import urlparse
        domain = urlparse(final_url).netloc.lower().lstrip('www.')
        return domain.startswith(slug + '.') or domain.startswith(slug + '-')


def _shopify_via_products_json(base_url: str) -> bool:
    """True if /products.json returns valid Shopify JSON (not HTML)."""
    base = base_url.rstrip('/')
    try:
        r = get(f'{base}/products.json', timeout=10)
        body = r.text.strip()
        # Must be JSON (starts with {), status 200, and contain "products" key
        return (r.status_code == 200
                and body.startswith('{')
                and '"products"' in body[:200])
    except Exception:
        return False


def _shopify_via_html(url: str) -> bool:
    try:
        r = get(url, timeout=15)
        return any(sig in r.text for sig in SHOPIFY_HTML_SIGNALS)
    except Exception:
        return False


def find_shopify_url(company: str) -> str | None:
    """
    Return a URL (store or myshopify.com) confirming the company is on Shopify,
    or None if no evidence found.
    """
    slugs = _slugs(company)

    # 1. myshopify.com subdomain — definitive proof
    for slug in slugs:
        if not _shopify_via_myshopify(slug, company):
            time.sleep(0.2)
            continue

        myshop = f'https://{slug}.myshopify.com'

        # Verify it's an active, real ecommerce store
        try:
            pj = get(f'{myshop}/products.json?limit=3', timeout=10)
            body = pj.text.strip()

            # Password-protected store (real, just closed to public)
            is_locked = (pj.status_code in (401, 403) or
                         'password' in pj.url.lower() or
                         ('password' in body[:500].lower() and not body.startswith('{')))
            if is_locked:
                return myshop

            # Has real products (JSON)
            has_real_products = (pj.status_code == 200
                                 and body.startswith('{')
                                 and '"products"' in body[:200]
                                 # Reject dev/demo stores that only have default Shopify items
                                 and 'shopify-t-shirt' not in body.lower()
                                 and 'snowboard' not in body[:300].lower())
            if has_real_products:
                return myshop

            # Not a real store
        except Exception:
            return myshop  # Network issue — allow through

        time.sleep(0.2)

    # 2. Guess main domain, then test products.json + HTML signals
    candidates: list[str] = []
    for slug in slugs:
        candidates += [
            f'https://www.{slug}.com',
            f'https://{slug}.com',
            f'https://www.{slug}.co',
            f'https://{slug}.co',
        ]

    for url in candidates:
        r = head(url)
        if r is None or r.status_code >= 500:
            continue
        # Use final URL after redirects
        final = r.url
        if _shopify_via_products_json(final) or _shopify_via_html(final):
            return final
        # Only probe the first reachable candidate per slug pair
        if r.status_code < 500:
            break

    return None

# ── LinkedIn guest API ───────────────────────────────────────────────────────

LI_QUERIES = [
    # Shopify-specific
    'shopify marketing analyst',
    'shopify analytics marketing analyst reporting',
    # ecommerce / DTC
    'ecommerce marketing analyst reporting',
    'DTC marketing analyst reporting',
    'direct to consumer marketing analyst reporting',
    'online retail marketing analyst reporting',
    'shopify ecommerce analyst reporting',
    # Tool-stack signals common in Shopify brands
    'klaviyo marketing analyst reporting',
    'google analytics marketing analyst ecommerce reporting',
    'meta ads marketing analyst ecommerce reporting',
    # Brand / consumer product sector
    'consumer brand marketing analyst reporting',
    'brand marketing analyst ecommerce reporting',
    'performance marketing analyst ecommerce reporting',
    'growth marketing analyst ecommerce reporting',
    'email marketing analyst ecommerce reporting',
    'paid media analyst ecommerce reporting',
    # Sector-specific
    'beauty marketing analyst ecommerce reporting',
    'apparel marketing analyst ecommerce reporting',
    'fashion marketing analyst reporting',
    'health wellness marketing analyst ecommerce reporting',
    'food beverage marketing analyst ecommerce reporting',
    'cpg marketing analyst reporting',
]

# No industry filter — cast wide net and rely on Shopify detection to filter
LI_INDUSTRY = ''


def scrape_linkedin(max_pages: int = 8) -> list[dict]:
    jobs:  list[dict]  = []
    seen:  set[tuple]  = set()

    for query in LI_QUERIES:
        print(f'  "{query}" …')
        for pg in range(max_pages):
            url = (
                'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search'
                f'?keywords={quote(query)}&start={pg * 25}{LI_INDUSTRY}'
            )
            try:
                r = get(url, extra=LI_HEADERS)
                if r.status_code != 200:
                    break
            except Exception as e:
                print(f'    err: {e}')
                break

            cards = BeautifulSoup(r.text, 'html.parser').select('li')
            if not cards:
                break

            new = 0
            for card in cards:
                try:
                    t_el  = card.select_one('h3.base-search-card__title')
                    title = t_el.get_text(strip=True) if t_el else ''
                    if 'marketing analyst' not in title.lower():
                        continue

                    c_el    = card.select_one('h4.base-search-card__subtitle a, h4.base-search-card__subtitle')
                    company = c_el.get_text(strip=True) if c_el else ''
                    if not company or NON_ECOMMERCE.search(company):
                        continue

                    a_el    = card.select_one('a.base-card__full-link')
                    job_url = (a_el['href'].split('?')[0]) if a_el else ''

                    key = (company.lower(), title.lower())
                    if key in seen:
                        continue
                    seen.add(key)

                    jobs.append({'title': title, 'company': company,
                                 'job_url': job_url, 'source': 'LinkedIn'})
                    print(f'    + {company}: {title}')
                    new += 1
                except Exception:
                    continue

            if new == 0:
                break
            time.sleep(random.uniform(1.5, 2.5))

    return jobs

# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print('=' * 62)
    print('Shopify Ecommerce  |  Marketing Analyst + reporting  |  Global')
    print('=' * 62)

    print('\n[1/2] Scraping LinkedIn …')
    all_jobs = scrape_linkedin()
    print(f'\n  {len(all_jobs)} unique listings collected')

    # Note: LinkedIn search with "reporting" keyword means descriptions contain it.
    # Individual job pages return 999 without auth, so we trust the search filter.

    print('\n[2/2] Checking companies for Shopify …\n')
    results: list[dict] = []
    checked: dict[str, str | None] = {}

    for i, job in enumerate(all_jobs):
        company = re.sub(r'\s+', ' ', job['company'].strip())
        ckey    = company.lower()

        print(f'[{i+1}/{len(all_jobs)}] {company}', end='  ')

        if ckey in checked:
            shopify_url = checked[ckey]
            if shopify_url:
                results.append({
                    'Company':   company,
                    'Job Title': job['title'],
                    'Job URL':   job['job_url'],
                    'Website':   shopify_url,
                    'Source':    job['source'],
                })
                print(f'(cached ✓)')
            else:
                print('(cached ✗)')
            continue

        shopify_url = find_shopify_url(company)
        checked[ckey] = shopify_url

        if shopify_url:
            results.append({
                'Company':   company,
                'Job Title': job['title'],
                'Job URL':   job['job_url'],
                'Website':   shopify_url,
                'Source':    job['source'],
            })
            print(f'✓  {shopify_url}')
        else:
            print('✗')

        time.sleep(random.uniform(0.6, 1.2))

    # ── Write CSV ────────────────────────────────────────────────────────────
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as f:
        fields = ['Company', 'Job Title', 'Job URL', 'Website', 'Source']
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(results)

    print(f'\n{"="*62}')
    print(f'Done.  {len(results)} Shopify ecommerce brands hiring Marketing Analysts.')
    print(f'CSV → {OUTPUT_FILE}')


if __name__ == '__main__':
    main()
