"""Demo: classify company website domains with the TypeSafe SDK (Jev model).

For each domain in SAMPLE_DOMAINS, this script:
  1. Fetches the homepage HTML (best-effort; falls back to just the domain
     name if the fetch fails, e.g. due to bot-blocking or network issues).
  2. Asks TypeSafe's `system_one` API two yes/no ("noul") questions about it:
       - is_ecommerce: does this look like an online store?
       - is_shopify:   does it look like it's built on Shopify?
  3. Prints a table of domain -> (verdict, confidence) for each question.

Each "noul" answer is a confidence score in [0, 1] (near 1 = yes, near 0 =
no, near 0.5 = uncertain) rather than a plain boolean.

Requirements:
    pip install typesafe-sdk

Environment:
    TYPESAFE_API_KEY must be set (picked up automatically by TypeSafeClient).

Usage:
    python typesafe_ecommerce_classifier_demo.py
"""

from __future__ import annotations

import urllib.error
import urllib.request

import typesafe_sdk as ts

MODEL = "jev-latest"
CONFIDENCE_THRESHOLD = 0.5
HTML_SNIPPET_CHARS = 6000
FETCH_TIMEOUT_SECONDS = 10

# A mix of known Shopify ecommerce stores, non-Shopify ecommerce stores,
# and non-ecommerce sites.
SAMPLE_DOMAINS = [
    "allbirds.com",
    "gymshark.com",
    "kyliecosmetics.com",
    "colourpop.com",
    "amazon.com",
    "target.com",
    "wikipedia.org",
    "github.com",
    "bbc.com",
    "nytimes.com",
]


def fetch_homepage_snippet(domain: str) -> str:
    """Best-effort fetch of the homepage HTML, truncated to a manageable size."""
    url = f"https://{domain}"
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (TypeSafeDemo)"})
    try:
        with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
            body = response.read(HTML_SNIPPET_CHARS * 4)
            return body.decode("utf-8", errors="ignore")[:HTML_SNIPPET_CHARS]
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return f"(Could not fetch {url}: {exc})"


def classify_domain(client: ts.TypeSafeClient, domain: str) -> ts.SystemOneResponse:
    html_snippet = fetch_homepage_snippet(domain)
    state = f"Domain: {domain}\n\nHomepage HTML (possibly truncated):\n{html_snippet}"

    return client.system_one(
        state=state,
        questions={
            "is_ecommerce": ts.Noul(
                instructions=(
                    "Is this website primarily an ecommerce store that sells products "
                    "directly to consumers online (i.e. has a shopping cart / checkout "
                    "flow), as opposed to a non-commerce site like a news outlet, "
                    "reference site, or developer platform?"
                )
            ),
            "is_shopify": ts.Noul(
                instructions=(
                    "Does this website appear to be built on the Shopify ecommerce "
                    "platform, based on signals like Shopify CDN references "
                    "(cdn.shopify.com), myshopify.com, Shopify asset/script tags, or "
                    "known Shopify page structure? Answer no if it is not an ecommerce "
                    "site at all, or if it looks like it runs on a different platform "
                    "(custom-built, WooCommerce, Magento, BigCommerce, etc.)."
                )
            ),
        },
        model=MODEL,
    )


def verdict(confidence: float) -> str:
    return "Yes" if confidence >= CONFIDENCE_THRESHOLD else "No"


def main() -> None:
    rows: list[tuple[str, float, float]] = []

    with ts.TypeSafeClient() as client:
        for domain in SAMPLE_DOMAINS:
            result = classify_domain(client, domain)
            ecommerce_conf = result.answers["is_ecommerce"].noul
            shopify_conf = result.answers["is_shopify"].noul
            rows.append((domain, ecommerce_conf, shopify_conf))
            print(f"Classified {domain}...")

    print()
    header = f"{'Domain':<22} {'Ecommerce?':<12} {'Conf.':<8} {'Shopify?':<12} {'Conf.':<8}"
    print(header)
    print("-" * len(header))
    for domain, ecommerce_conf, shopify_conf in rows:
        print(
            f"{domain:<22} "
            f"{verdict(ecommerce_conf):<12} "
            f"{ecommerce_conf:<8.2f} "
            f"{verdict(shopify_conf):<12} "
            f"{shopify_conf:<8.2f}"
        )


if __name__ == "__main__":
    main()
