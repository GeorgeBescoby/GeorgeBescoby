#!/usr/bin/env python3
"""
ASK BOSCO - Black Friday Stock & Spend Check

Builds a single-file, phone-friendly HTML report for any Shopify store using
only public data:

  * /products.json        catalogue, prices, compare-at prices, size-level stock
  * /meta.json            store name, currency, country
  * homepage HTML         Shopify app pixels (webPixelsConfigList), GA4/Ads/GTM IDs
  * gtm.js?id=GTM-XXXX    tags inside the brand's published Google Tag Manager container
  * Yotpo bottomline API  per-product review counts (only if the store uses Yotpo)

Usage:
  python3 bfcm_check.py wearetala.com
  python3 bfcm_check.py allbirds.com snagtights.com --out reports
  python3 bfcm_check.py --from-file domains.txt --out reports

Python 3.9+, standard library only.
"""

import argparse
import concurrent.futures as cf
import csv
import datetime as dt
import html
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
APP_STORE_URL = "https://apps.shopify.com/ask-bosco"
MIN_PRODUCTS = 5          # below this there's nothing to analyse
SEND_MIN_PRODUCTS = 20    # below this the report is too thin to send cold
SEND_MIN_ISSUES = 3       # need at least this many fix + sold-out products to be worth sending
MAX_PAGES = 40            # 40 x 250 = 10,000 products
MAX_REVIEW_LOOKUPS = 1200  # Yotpo calls per brand (cheap, parallel)
EXAMPLE_BF_CODE = 0.20    # illustrative sitewide code used in the stacking example


class Skip(Exception):
    """Raised when a store can't produce an honest report."""


# --------------------------------------------------------------------------- #
# Fetching
# --------------------------------------------------------------------------- #

def fetch(url, want_json=False, retries=5, timeout=30):
    """GET with backoff on Shopify's 429/503 rate limiting. Returns (status, body)."""
    delay = 2
    last = (0, None)
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={
            "User-Agent": UA,
            "Accept": "application/json" if want_json else "text/html,*/*",
            "Accept-Language": "en-GB,en;q=0.9",
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read().decode("utf-8", errors="replace")
                if want_json:
                    try:
                        return r.status, json.loads(body)
                    except ValueError:
                        return r.status, None
                return r.status, body
        except urllib.error.HTTPError as e:
            last = (e.code, None)
            if e.code in (429, 500, 502, 503, 504, 520, 522):
                time.sleep(delay)
                delay *= 2
                continue
            return last
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            last = (0, str(e))
            time.sleep(delay)
            delay *= 2
    return last


def normalise_domain(d):
    d = d.strip().lower()
    d = re.sub(r"^https?://", "", d).split("/")[0]
    return d


def fetch_products(base, log):
    products, page = [], 1
    while page <= MAX_PAGES:
        status, data = fetch(f"{base}/products.json?limit=250&page={page}", want_json=True)
        if status != 200 or not isinstance(data, dict) or "products" not in data:
            if page == 1:
                raise Skip(f"products.json not available (HTTP {status}). Likely a headless "
                           f"or locked-down store, or not Shopify.")
            log(f"  page {page}: HTTP {status}, stopping with {len(products)} products")
            break
        batch = data["products"]
        if not batch:
            break
        products.extend(batch)
        log(f"  page {page}: {len(batch)} products")
        if len(batch) < 250:
            break
        page += 1
        time.sleep(0.6)
    return products


# --------------------------------------------------------------------------- #
# Marketing stack detection
# --------------------------------------------------------------------------- #

# (name, group, regex over page/GTM text). Hostnames are used rather than words
# so that a blog post mentioning "TikTok" doesn't count as a TikTok pixel.
TEXT_SIGNATURES = [
    ("Meta (Facebook/Instagram)", "ads", r"connect\.facebook\.net/[^\"']*fbevents|fbq\(\s*['\"]init"),
    ("TikTok", "ads", r"analytics\.tiktok\.com"),
    ("Pinterest", "ads", r"s\.pinimg\.com/ct/|pintrk\("),
    ("Snapchat", "ads", r"sc-static\.net/scevent|snaptr\("),
    ("Microsoft Ads", "ads", r"bat\.bing\.com"),
    ("Reddit", "ads", r"redditstatic\.com/ads|rdt\(\s*['\"]init"),
    ("Criteo", "ads", r"static\.criteo\.net|dynamic\.criteo\.com"),
    ("Amazon Ads", "ads", r"amazon-adsystem\.com"),
    ("Klaviyo", "email", r"static\.klaviyo\.com|klaviyo\.com/onsite|a\.klaviyo\.com"),
    ("Attentive", "email", r"cdn\.attn\.tv|attentivemobile"),
    ("Postscript", "email", r"sdk\.postscript\.io"),
    ("Omnisend", "email", r"omnisnippet|omnisrc\.com"),
    ("Awin", "affiliate", r"dwin1\.com|awin1\.com"),
    ("Impact", "affiliate", r"impactcdn\.com|impactradius-event"),
    ("Rakuten Advertising", "affiliate", r"linksynergy\.com|rakutenadvertising"),
    ("CJ Affiliate", "affiliate", r"emjcd\.com|cj\.dotomi"),
    ("Partnerize", "affiliate", r"prf\.hn"),
    ("Hotjar", "analytics", r"static\.hotjar\.com|hotjar\.com/c/hotjar"),
    ("Microsoft Clarity", "analytics", r"clarity\.ms/tag"),
    ("Elevar", "analytics", r"getelevar\.com"),
    ("Triple Whale", "analytics", r"triplewhale|triplepixel"),
    ("Northbeam", "analytics", r"northbeam\.io"),
    ("Yotpo", "reviews", r"staticw2\.yotpo\.com|cdn-widgetsrepository\.yotpo\.com"),
    ("Judge.me", "reviews", r"cdn\.judge\.me|cdnwidget\.judge\.me"),
    ("Okendo", "reviews", r"okendo\.io"),
    ("Stamped", "reviews", r"stamped\.io"),
    ("Reviews.io", "reviews", r"widget\.reviews\.io|reviews\.io/"),
    ("Trustpilot widget", "reviews", r"widget\.trustpilot\.com"),
    ("Bazaarvoice", "reviews", r"bazaarvoice\.com"),
]

# Shopify Customer Events app pixels, identified by their configuration keys.
# These were checked against TALA, Snag, Grind, Pip & Nut, Lounge, Gymshark, Allbirds.
def identify_app_pixel(cfg_raw):
    try:
        cfg = json.loads(cfg_raw) if cfg_raw else {}
    except ValueError:
        return []
    if not isinstance(cfg, dict):
        return []
    found = []
    if cfg.get("pixel_type") == "facebook_pixel":
        found.append(("Meta (Facebook/Instagram)", "ads"))
    if "pixelCode" in cfg:
        found.append(("TikTok", "ads"))
    if "tagID" in cfg:
        found.append(("Pinterest", "ads"))
    if "redditPixelId" in cfg:
        found.append(("Reddit", "ads"))
    if "accountID" in cfg and "webPixelConfig" in cfg:
        found.append(("Klaviyo", "email"))
    if "yotpoStoreId" in cfg:
        found.append(("Yotpo", "reviews"))
    if cfg.get("webPixelName") == "Judge.me":
        found.append(("Judge.me", "reviews"))
    if "getelevar" in str(cfg.get("config_url", "")):
        found.append(("Elevar", "analytics"))
    inner = cfg.get("config")
    if isinstance(inner, str) and ("google_tag_ids" in inner or "gtag_events" in inner):
        found.append(("Google & YouTube app", "google"))
    return found


def extract_web_pixels(page):
    i = page.find("webPixelsConfigList")
    if i < 0:
        return []
    j = page.find("[", i)
    if j < 0:
        return []
    depth = 0
    for k in range(j, min(len(page), j + 400000)):
        c = page[k]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(page[j:k + 1])
                except ValueError:
                    return []
    return []


def real_id(x):
    """Drop placeholder IDs like G-1111111111 or G-XXXXXXX."""
    tail = x.split("-", 1)[1]
    return len(set(tail)) > 2 and "XXXX" not in tail.upper()


def detect_stack(base, log):
    status, page = fetch(base + "/")
    if status != 200 or not page:
        log(f"  homepage HTTP {status}: stack section will be marked unavailable")
        return {"ok": False}
    platforms = {}  # name -> {"group":..., "sources": set()}

    def add(name, group, source):
        p = platforms.setdefault(name, {"group": group, "sources": set()})
        p["sources"].add(source)

    pixels = extract_web_pixels(page)
    unknown_app_pixels = 0
    yotpo_key = None
    for px in pixels:
        if px.get("type") != "APP" or px.get("apiClientId") == "shopify-pixel":
            continue
        ids = identify_app_pixel(px.get("configuration"))
        if not ids:
            unknown_app_pixels += 1
        for name, group in ids:
            add(name, group, "Shopify app pixel")
        try:
            cfg = json.loads(px.get("configuration") or "{}")
            if isinstance(cfg, dict) and cfg.get("yotpoStoreId"):
                yotpo_key = cfg["yotpoStoreId"]
        except ValueError:
            pass

    gtm_ids = sorted(set(re.findall(r"GTM-[A-Z0-9]{5,9}", page)))[:4]
    gtm_text = ""
    gtm_ok = []
    for gid in gtm_ids:
        st, js = fetch(f"https://www.googletagmanager.com/gtm.js?id={gid}")
        if st == 200 and js:
            gtm_text += js
            gtm_ok.append(gid)
    log(f"  app pixels: {len(pixels)}, GTM containers read: {gtm_ok or 'none'}")

    for source, text in (("site code", page), ("Google Tag Manager", gtm_text)):
        if not text:
            continue
        for name, group, rx in TEXT_SIGNATURES:
            if re.search(rx, text, re.I):
                add(name, group, source)

    all_text = page + gtm_text
    ga4 = sorted({x for x in re.findall(r"\bG-[A-Z0-9]{8,12}\b", all_text) if real_id(x)})
    aw = sorted({x for x in re.findall(r"\bAW-\d{8,12}\b", all_text) if real_id(x)})
    ua = sorted({x for x in re.findall(r"\bUA-\d{4,10}-\d{1,3}\b", all_text)})
    if ga4:
        add("Google Analytics 4", "analytics", "site code / GTM")
    if aw:
        add("Google Ads", "ads", "site code / GTM")
    if "Google & YouTube app" in platforms:
        # The Google app carries GA4/Ads IDs inside its config, so fold it into those.
        src = platforms.pop("Google & YouTube app")["sources"]
        for name, group in (("Google Analytics 4", "analytics"), ("Google Ads", "ads")):
            if (name == "Google Analytics 4" and ga4) or (name == "Google Ads" and aw):
                for s in src:
                    add(name, group, s)
    if not yotpo_key:
        m = re.search(r"staticw2\.yotpo\.com/([A-Za-z0-9]{20,60})/", page)
        if m:
            yotpo_key = m.group(1)

    flags = []
    if ua:
        flags.append(f"A Universal Analytics ID ({ua[0]}) is still in your site code or GTM container. "
                     f"Google switched off Universal Analytics in 2023-24, so this tag no longer records "
                     f"anything. It's harmless clutter, but worth removing before BFCM.")
    if len(ga4) > 1:
        flags.append(f"{len(ga4)} different GA4 measurement IDs are tagged ({', '.join(ga4[:4])}). "
                     f"That's fine if it's deliberate (e.g. one per region or agency), but if not, "
                     f"traffic is being split across properties.")
    for name, p in platforms.items():
        if p["group"] == "ads" and "Shopify app pixel" in p["sources"] and "Google Tag Manager" in p["sources"]:
            flags.append(f"{name} appears both as a Shopify app pixel and inside GTM. "
                         f"If both fire purchase events without deduplication, {name.split(' (')[0]} "
                         f"could count some orders twice. Worth a quick check.")
    return {
        "ok": True,
        "platforms": {k: {"group": v["group"], "sources": sorted(v["sources"])} for k, v in platforms.items()},
        "gtm_ids": gtm_ok,
        "ga4_ids": ga4,
        "aw_ids": aw,
        "ua_ids": ua,
        "unknown_app_pixels": unknown_app_pixels,
        "yotpo_key": yotpo_key,
        "flags": flags,
        "page": page,
    }


def yotpo_counts(key, product_ids, log):
    out = {}

    def one(pid):
        st, d = fetch(f"https://api.yotpo.com/products/{key}/{pid}/bottomline", want_json=True, retries=2)
        try:
            return pid, int(d["response"]["bottomline"]["total_reviews"])
        except (TypeError, KeyError, ValueError):
            return pid, None

    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        for pid, n in ex.map(one, product_ids[:MAX_REVIEW_LOOKUPS]):
            if n is not None:
                out[pid] = n
    log(f"  Yotpo review counts: {len(out)} products")
    return out


# --------------------------------------------------------------------------- #
# Catalogue analysis
# --------------------------------------------------------------------------- #

EXCLUDE_RX = re.compile(r"gift ?card|e-?gift|voucher|shipping protection|package protection|"
                        r"message card|gift ?wrap|gift note|gift message|"
                        r"insurance|route protection|warranty|donation|free sample|"
                        r"\bsample\b|swatch|\bpostage\b|\bdeposit\b", re.I)
SIZE_OPT_RX = re.compile(r"\b(size|sizes|taille|gr[öo]ße|talla|maat|shoe size|waist|bra size)\b", re.I)
PACK_VALUE_RX = re.compile(r"\d\s?(g|kg|ml|l|oz|lb|pack|pk|x|caps|tabs|servings)\b", re.I)
CORE_LETTER = {"S", "M", "L", "SMALL", "MEDIUM", "LARGE", "S/M", "M/L", "S-M", "M-L"}
LETTER_SIZES = CORE_LETTER | {"XXS", "2XS", "XS", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL",
                              "XS/S", "L/XL", "XS-S", "L-XL", "EXTRA SMALL", "EXTRA LARGE"}


def money(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def size_index(product):
    for i, opt in enumerate(product.get("options") or []):
        name = opt.get("name", "") if isinstance(opt, dict) else str(opt)
        if SIZE_OPT_RX.search(name) and "pack" not in name.lower():
            values = opt.get("values") or []
            if values and all(PACK_VALUE_RX.search(str(x)) for x in values):
                return None
            return i
    return None


def core_sizes(ordered):
    norm = [s.strip().upper() for s in ordered]
    if norm and all(s in LETTER_SIZES for s in norm):
        core = [o for o, n in zip(ordered, norm) if n in CORE_LETTER]
        if core:
            return core
    n = len(ordered)
    if n <= 2:
        return list(ordered)
    lo, hi = int(n * 0.25), max(int(n * 0.25) + 1, -(-n * 3 // 4))
    return list(ordered[lo:hi])


def analyse(products, now, reviews=None):
    reviews = reviews or {}
    items, excluded = [], 0
    for p in products:
        variants = p.get("variants") or []
        if not variants:
            continue
        if EXCLUDE_RX.search(f"{p.get('title','')} {p.get('product_type','')}") or \
                not any(v.get("requires_shipping", True) for v in variants):
            excluded += 1
            continue
        prices = [money(v.get("price")) for v in variants if money(v.get("price"))]
        if not prices:
            excluded += 1
            continue
        avail = [bool(v.get("available")) for v in variants]
        depths = []
        for v in variants:
            pr, ca = money(v.get("price")), money(v.get("compare_at_price"))
            if pr and ca and ca > pr * 1.01:
                depths.append(1 - pr / ca)
        si = size_index(p)
        sizes_in, sizes_out, core_out = [], [], []
        if si is not None and len(variants) > 1:
            key = f"option{si + 1}"
            order, by_size = [], {}
            for v in variants:
                s = v.get(key)
                if s is None:
                    continue
                if s not in by_size:
                    order.append(s)
                    by_size[s] = False
                by_size[s] = by_size[s] or bool(v.get("available"))
            sizes_in = [s for s in order if by_size[s]]
            sizes_out = [s for s in order if not by_size[s]]
            core = set(core_sizes(order))
            core_out = [s for s in sizes_out if s in core]
            # Wide size runs (e.g. A-H with sub-sizes) have many core sizes; one gap among
            # eight isn't the same problem as M missing from S/M/L, so scale the bar.
            if len(core_out) < max(1, -(-len(core) // 4)):
                core_out = []
            if len(order) < 2:
                si = None
        try:
            created = dt.datetime.fromisoformat(p["created_at"])
            age = (now - created).days
        except (KeyError, ValueError, TypeError):
            age = None

        if not any(avail):
            status = "sold_out"
        elif si is not None and core_out and sizes_in:
            status = "fix"
        elif si is None and len(variants) > 1 and not all(avail) and sum(avail) / len(avail) <= 0.5:
            status = "fix"  # most flavours/colours/options out
        elif (si is not None and not sizes_out) or (si is None and all(avail)):
            status = "markdown" if depths else "ready"
        else:
            status = "markdown" if depths else "minor_gap"

        items.append({
            "id": p.get("id"),
            "title": p.get("title", "").strip(),
            "handle": p.get("handle"),
            "type": (p.get("product_type") or "").strip() or "Untyped",
            "price": min(prices),
            "price_max": max(prices),
            "variants": len(variants),
            "variants_out": avail.count(False),
            "sized": si is not None,
            "sizes_in": sizes_in,
            "sizes_out": sizes_out,
            "core_out": core_out,
            "discount": max(depths) if depths else 0.0,
            "age_days": age,
            "status": status,
            "reviews": reviews.get(p.get("id")),
        })
    return items, excluded


def rank_key(it):
    r = it["reviews"] if it["reviews"] is not None else -1
    return (-r, -len(it["core_out"]), -it["price"])


def summarise(items, now):
    n = len(items)
    var = sum(i["variants"] for i in items)
    var_out = sum(i["variants_out"] for i in items)
    by = lambda s: [i for i in items if i["status"] == s]
    fix = sorted(by("fix"), key=rank_key)
    # "gap" = most of the size run is still there, so a restock would fix it;
    # "nearly gone" = only a few fringe sizes/options left, more like the end of a line.
    def in_share(i):
        tot = len(i["sizes_in"]) + len(i["sizes_out"]) if i["sized"] else i["variants"]
        got = len(i["sizes_in"]) if i["sized"] else i["variants"] - i["variants_out"]
        return got / tot if tot else 0
    gaps = [i for i in fix if in_share(i) >= 0.5]
    gone = [i for i in fix if in_share(i) < 0.5]
    ready = sorted(by("ready"), key=lambda i: (-(i["reviews"] or -1), -i["price"]))
    sold_out = sorted(by("sold_out"), key=lambda i: (-(i["reviews"] or -1), i["age_days"] or 9999))
    marked = [i for i in items if i["discount"] > 0 and i["status"] != "sold_out"]
    md_depths = [i["discount"] for i in marked]
    median_depth = statistics.median(md_depths) if md_depths else 0
    new90 = [i for i in items if i["age_days"] is not None and 0 <= i["age_days"] <= 90]
    new90_fix = [i for i in new90 if i["status"] in ("fix", "sold_out")]

    cats = {}
    for i in items:
        c = cats.setdefault(i["type"], {"n": 0, "v": 0, "vo": 0, "fix": 0, "md": 0, "so": 0, "ready": 0})
        c["n"] += 1
        c["v"] += i["variants"]
        c["vo"] += i["variants_out"]
        c["fix"] += i["status"] == "fix"
        c["so"] += i["status"] == "sold_out"
        c["md"] += i["discount"] > 0
        c["ready"] += i["status"] == "ready"
    cat_rows = sorted(cats.items(), key=lambda kv: -kv[1]["n"])

    # Which single size is most often the missing one? Only meaningful for sized catalogues.
    miss = {}
    for i in fix:
        for s in i["core_out"]:
            miss[s] = miss.get(s, 0) + 1
    top_missing = sorted(miss.items(), key=lambda kv: -kv[1])[:3]

    return {
        "n": n, "variants": var, "variants_out": var_out,
        "pct_var_out": var_out / var if var else 0,
        "fix": fix, "gaps": gaps, "gone": gone, "ready": ready, "sold_out": sold_out, "marked": sorted(marked, key=lambda i: -i["discount"]),
        "pct_marked": len(marked) / n if n else 0, "median_depth": median_depth,
        "new90": new90, "new90_fix": new90_fix, "cats": cat_rows, "top_missing": top_missing,
        "sized_share": sum(i["sized"] for i in items) / n if n else 0,
        "has_reviews": any(i["reviews"] is not None for i in items),
    }


def example_product(s):
    """The product quoted in the lead and email hook: prefer a gap in the middle of the run."""
    pool = s["gaps"] or s["fix"]
    return pool[0] if pool else None


def black_friday(year):
    d = dt.date(year, 11, 1)
    first_thu = d + dt.timedelta(days=(3 - d.weekday()) % 7)
    return first_thu + dt.timedelta(days=22)


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #

CURRENCY = {"GBP": "£", "USD": "$", "EUR": "€", "AUD": "A$", "CAD": "C$", "NZD": "NZ$",
            "SEK": "kr ", "DKK": "kr ", "NOK": "kr ", "CHF": "CHF ", "JPY": "¥", "INR": "₹"}

ASKBOSCO_CONNECTS = {"Meta (Facebook/Instagram)", "Google Ads", "Google Analytics 4", "TikTok",
                     "Microsoft Ads", "Amazon Ads", "Klaviyo", "Awin", "Impact", "Rakuten Advertising",
                     "CJ Affiliate", "Partnerize"}

GROUP_LABEL = {"ads": "Ad platforms", "email": "Email & SMS", "affiliate": "Affiliate networks",
               "analytics": "Analytics & measurement", "reviews": "Reviews"}
REPORTING_GROUPS = {"ads", "email", "affiliate"}

e = lambda s: html.escape(str(s), quote=True)


def pct(x, digits=0):
    return f"{x * 100:.{digits}f}%"


def chips(values, cls):
    return "".join(f'<span class="chip {cls}">{e(v)}</span>' for v in values)


def product_row(it, base, sym, show_sizes=True, extra=""):
    meta = [e(it["type"]), f"{sym}{it['price']:,.2f}".replace(".00", "")]
    if it["reviews"]:
        meta.append(f"{it['reviews']:,} review{'s' if it['reviews'] != 1 else ''}")
    if it["discount"]:
        meta.append(f"{pct(it['discount'])} off now")
    sizes = ""
    if show_sizes and it["sized"]:
        sizes = (f'<div class="sizes"><span class="lbl">Out</span>{chips(it["sizes_out"], "out")}'
                 f'<span class="lbl">In</span>{chips(it["sizes_in"], "in")}</div>')
    elif show_sizes and it["variants_out"]:
        sizes = (f'<div class="sizes"><span class="chip out">{it["variants_out"]} of {it["variants"]} '
                 f'options sold out</span></div>')
    return (f'<li class="prod"><a href="{e(base)}/products/{e(it["handle"])}" target="_blank" rel="noopener">'
            f'{e(it["title"])}</a><div class="meta">{" · ".join(meta)}{extra}</div>{sizes}</li>')


def style_of(title):
    """'Sculpt Bandeau Bra - Fig' -> 'Sculpt Bandeau Bra'. Stores that list each colour as its own product."""
    return re.split(r"\s+[-–|/]\s+", title, maxsplit=1)[0].strip().lower()


def group_styles(items):
    groups, order = {}, []
    for i in items:
        k = style_of(i["title"])
        if k not in groups:
            groups[k] = []
            order.append(k)
        groups[k].append(i)
    return [groups[k] for k in order]


def style_row(group, base, sym):
    first = group[0]
    if len(group) == 1:
        return product_row(first, base, sym, show_sizes=False)
    name = re.split(r"\s+[-–|/]\s+", first["title"], maxsplit=1)[0].strip()
    colours = [re.split(r"\s+[-–|/]\s+", i["title"], maxsplit=1)[-1] for i in group]
    meta = [e(first["type"]), f"{sym}{first['price']:,.2f}".replace(".00", "")]
    if first["reviews"]:
        meta.append(f"{first['reviews']:,} review{'s' if first['reviews'] != 1 else ''}")
    return (f'<li class="prod"><a href="{e(base)}/products/{e(first["handle"])}" target="_blank" rel="noopener">'
            f'{e(name)}</a> <span class="meta">· {len(group)} versions</span><div class="meta">{" · ".join(meta)}</div>'
            f'<div class="sizes">{chips(colours[:8], "p")}{"<span class=meta>+" + str(len(colours) - 8) + "</span>" if len(colours) > 8 else ""}</div></li>')


def render(ctx):
    s, stack, sym = ctx["s"], ctx["stack"], ctx["sym"]
    base, store, days = ctx["base"], ctx["store"], ctx["days_to_bf"]
    logo = ctx["logo"]
    bf = ctx["bf_date"]
    out = []
    w = out.append

    # ---------------- headline sentence ----------------
    if s["fix"]:
        ex = example_product(s)
        if ex["sized"]:
            lead_ex = f'e.g. <b>{e(ex["title"])}</b> is out in {e(", ".join(ex["core_out"]))}'
        else:
            lead_ex = f'e.g. <b>{e(ex["title"])}</b> has {ex["variants_out"]} of {ex["variants"]} options sold out'
        lead = (f'<b>{len(s["fix"])}</b> of your {s["n"]:,} live products are missing a core size or most of '
                f'their options right now ({lead_ex}). Another <b>{len(s["ready"]):,}</b> are at full price '
                f'with every size in stock, so they can carry Black Friday traffic without "sold out" dead ends.')
    else:
        lead = (f'None of your {s["n"]:,} live products is missing a core size or most of its options right now. '
                f'<b>{len(s["sold_out"])}</b> are completely sold out, and <b>{len(s["ready"]):,}</b> are at full price '
                f'with everything in stock.')

    platforms = stack.get("platforms", {}) if stack.get("ok") else {}
    reporting = sorted([k for k, v in platforms.items() if v["group"] in REPORTING_GROUPS])
    if "Google Analytics 4" in platforms:
        reporting.append("Google Analytics 4")

    # ---------------- page ----------------
    w(f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>{e(store)} · Black Friday Stock &amp; Spend Check · ASK BOSCO</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;800&display=swap" rel="stylesheet">
<style>
:root{{--ink:#2c2c2c;--purple:#7500e3;--purple-d:#1d0254;--yellow:#ffd500;--grey:#f6f6f6;--line:#e6e6e6;
--muted:#676879;--red:#c62828;--red-bg:#fdecec;--green:#1b7a3d;--green-bg:#e7f6ec;--card:#fff}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--grey);color:var(--ink);font:15px/1.55 Poppins,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-text-size-adjust:100%}}
a{{color:var(--purple)}}
.wrap{{max-width:860px;margin:0 auto;padding:0 16px}}
header{{background:var(--ink);color:#fff;padding:22px 0 30px}}
header .logo svg{{height:30px;width:auto;display:block}}
.kicker{{display:inline-block;margin-top:26px;background:var(--yellow);color:var(--ink);font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase;padding:4px 10px;border-radius:99px}}
h1{{font-weight:800;font-size:clamp(28px,6vw,42px);line-height:1.15;margin:14px 0 8px}}
h1 span{{color:var(--yellow)}}
.sub{{color:#cfcfd6;font-size:14px;margin:0}}
.lead{{background:var(--card);border-radius:16px;padding:20px;margin:-18px 0 18px;box-shadow:0 4px 18px rgba(0,0,0,.06);font-size:16px}}
.kpis{{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:0 0 22px}}
@media(min-width:680px){{.kpis{{grid-template-columns:repeat(4,1fr)}}}}
.kpi{{background:var(--card);border-radius:14px;padding:14px}}
.kpi b{{display:block;font-size:26px;font-weight:800;line-height:1.1}}
.kpi span{{font-size:12.5px;color:var(--muted);line-height:1.35;display:block;margin-top:4px}}
.kpi.hot b{{color:var(--red)}} .kpi.ok b{{color:var(--green)}}
section{{background:var(--card);border-radius:16px;padding:20px;margin:0 0 16px}}
h2{{font-weight:800;font-size:21px;line-height:1.25;margin:0 0 6px}}
h2 .n{{color:var(--purple)}}
.why{{color:var(--muted);font-size:14px;margin:0 0 14px}}
.tag{{display:inline-block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;padding:3px 8px;border-radius:6px;margin-bottom:8px}}
.t-fix{{background:var(--red-bg);color:var(--red)}} .t-ok{{background:var(--green-bg);color:var(--green)}}
.t-chk{{background:#fff6cc;color:#7a5d00}} .t-bridge{{background:#efe3fd;color:var(--purple)}}
ul.list{{list-style:none;margin:0;padding:0}}
.prod{{padding:11px 0;border-top:1px solid var(--line)}}
.prod:first-child{{border-top:0}}
.prod a{{font-weight:600;text-decoration:none;color:var(--ink)}}
.prod a:hover{{color:var(--purple)}}
.meta{{font-size:12.5px;color:var(--muted)}}
.sizes{{margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}}
.lbl{{font-size:11px;color:var(--muted);margin:0 2px 0 6px}} .lbl:first-child{{margin-left:0}}
.chip{{font-size:11.5px;padding:2px 7px;border-radius:6px;font-weight:500;white-space:nowrap}}
.chip.out{{background:var(--red-bg);color:var(--red);text-decoration:line-through}}
.chip.in{{background:var(--green-bg);color:var(--green)}}
.chip.p{{background:var(--grey);color:var(--ink);text-decoration:none}}
details{{margin-top:10px}}
summary{{cursor:pointer;color:var(--purple);font-weight:600;font-size:14px}}
.cat h3{{font-size:14px;margin:16px 0 0;font-weight:600}}
.cat h3 small{{color:var(--muted);font-weight:400}}
.callout{{background:var(--grey);border-left:4px solid var(--yellow);border-radius:8px;padding:12px 14px;font-size:14px;margin:12px 0 0}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
th{{text-align:left;font-weight:600;color:var(--muted);font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;padding:6px 6px 6px 0;border-bottom:1px solid var(--line)}}
td{{padding:8px 6px 8px 0;border-bottom:1px solid var(--line);vertical-align:middle}}
td.num,th.num{{text-align:right;white-space:nowrap}}
td .cn{{display:block;font-weight:600}} td .meta{{display:block}} td.b{{width:26%;min-width:74px}}
.bar{{height:6px;border-radius:3px;background:var(--line);margin-top:4px;overflow:hidden}}
.bar i{{display:block;height:100%;background:var(--red)}}
.bar.md i{{background:var(--purple)}}
.scroll{{overflow-x:auto;-webkit-overflow-scrolling:touch}}
.grp{{margin:12px 0 0}}
.grp h3{{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:0 0 6px;font-weight:600}}
.plat{{display:inline-flex;align-items:center;gap:6px;background:var(--grey);border-radius:8px;padding:6px 10px;margin:0 6px 6px 0;font-size:13px;font-weight:500}}
.plat small{{color:var(--muted);font-weight:400;font-size:11px}}
.plat.ab{{box-shadow:inset 0 0 0 1.5px var(--purple)}}
.flags li{{margin:0 0 8px}}
.gap{{display:grid;gap:10px}}
.gaprow{{border:1px solid var(--line);border-radius:12px;padding:14px}}
.gaprow h3{{font-size:15px;margin:0 0 8px;font-weight:600}}
.gaprow .two{{display:grid;gap:8px}}
@media(min-width:640px){{.gaprow .two{{grid-template-columns:1fr 1fr}}}}
.gaprow .two div{{font-size:13.5px;border-radius:8px;padding:10px}}
.see{{background:var(--grey)}} .ab-ans{{background:#f3ebfd}}
.gaprow b.h{{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}}
.see b.h{{color:var(--muted)}} .ab-ans b.h{{color:var(--purple)}}
.cta{{background:var(--purple-d);color:#fff;border-radius:16px;padding:24px 20px;margin:0 0 16px}}
.cta h2{{color:#fff}} .cta p{{color:#ddd3f5;margin:6px 0 16px}}
.btn{{display:inline-block;background:var(--yellow);color:var(--ink);font-weight:600;text-decoration:none;padding:12px 18px;border-radius:10px}}
.cta small{{display:block;margin-top:12px;color:#b9a9e0}}
footer{{font-size:12px;color:var(--muted);padding:6px 0 40px}}
footer h3{{font-size:13px;color:var(--ink);margin:14px 0 4px}}
footer ul{{padding-left:18px;margin:4px 0}}
code{{font-size:11.5px;background:#ececf1;padding:1px 4px;border-radius:4px;word-break:break-all}}
</style></head><body>
<header><div class="wrap">
<div class="logo" aria-label="ASK BOSCO">{logo}</div>
<span class="kicker">{days} days to Black Friday</span>
<h1>Black Friday Stock &amp; Spend Check<br><span>{e(store)}</span></h1>
<p class="sub">Prepared {ctx['date_str']} from {e(ctx['domain'])}'s public storefront only. No logins, no internal data. Black Friday is {bf.strftime('%a %-d %b %Y')}.</p>
</div></header>
<main class="wrap">
<div class="lead">{lead}</div>
<div class="kpis">
<div class="kpi"><b>{s['n']:,}</b><span>live products checked ({s['variants']:,} variants)</span></div>
<div class="kpi hot"><b>{pct(s['pct_var_out'])}</b><span>of variants sold out right now</span></div>
<div class="kpi hot"><b>{len(s['fix'])}</b><span>products missing a core size or most options</span></div>
<div class="kpi"><b>{pct(s['pct_marked'])}</b><span>of products on markdown and still buyable{(' (median ' + pct(s['median_depth']) + ' off)') if s['marked'] else ''}</span></div>
</div>
""")

    # ---------------- 1. Fix first ----------------
    if s["fix"]:
        top_missing = ""
        if s["top_missing"] and s["sized_share"] > 0.3:
            tm = ", ".join(f"<b>{e(k)}</b> ({v})" for k, v in s["top_missing"])
            top_missing = f'<div class="callout">The sizes missing most often: {tm}. If a restock is already on its way, check it lands before {bf.strftime("%-d %b")}.</div>'
        order_note = ("Most-reviewed first, using the review count Yotpo shows publicly for each product. We can't see your sales, so treat reviews as a rough popularity signal."
                      if s["has_reviews"] else
                      "Sorted by how many core sizes are out, then price. We can't see your sales, so you'll know better than us which of these matter most.")
        w(f"""<section><span class="tag t-fix">Fix first</span>
<h2><span class="n">{len(s['fix'])}</span> products are missing a core size</h2>
<p class="why">If any of these are in your Black Friday ads, emails or homepage, some of the people who click will land on "sold out in my size". Restock them, or swap in a product from the ready list below. {order_note}</p>""")
        if s["gaps"]:
            w(f"""<h3 style="font-size:16px;margin:16px 0 2px">{len(s['gaps'])} with a gap in the middle of the run</h3>
<p class="meta" style="margin:0 0 4px">Most sizes are still in stock, so a restock would close the gap.</p>
<ul class="list">{''.join(product_row(i, base, sym) for i in s['gaps'][:10])}</ul>""")
            if len(s["gaps"]) > 10:
                w(f"""<details><summary>Show all {len(s['gaps'])}</summary><ul class="list">{''.join(product_row(i, base, sym) for i in s['gaps'][10:])}</ul></details>""")
        if s["gone"]:
            w(f"""<h3 style="font-size:16px;margin:22px 0 2px">{len(s['gone'])} nearly gone</h3>
<p class="meta" style="margin:0 0 4px">Fewer than half their sizes or options are left. Fine if they're ending, but a poor fit for Black Friday promotion.</p>
<ul class="list">{''.join(product_row(i, base, sym) for i in s['gone'][:5])}</ul>""")
            if len(s["gone"]) > 5:
                w(f"""<details><summary>Show all {len(s['gone'])}</summary><ul class="list">{''.join(product_row(i, base, sym) for i in s['gone'][5:])}</ul></details>""")
        w(top_missing + "</section>")

    # ---------------- 2. Ready to push ----------------
    if s["ready"]:
        cats = {}
        for i in s["ready"]:
            cats.setdefault(i["type"], []).append(i)
        cat_order = sorted(cats.items(), key=lambda kv: -len(kv[1]))
        sort_note = ("most-reviewed first" if s["has_reviews"] else
                     "highest price first, because higher-ticket products absorb a Black Friday cost-per-acquisition best")
        w(f"""<section><span class="tag t-ok">Ready to push</span>
<h2><span class="n">{len(s['ready']):,}</span> full-price products with {'every size' if s['sized_share'] >= 0.3 else 'everything'} in stock</h2>
<p class="why">Every {'size' if s['sized_share'] >= 0.3 else 'option'} is available and none of them is marked down today, so any Black Friday offer on these comes off full price and doesn't stack on an existing sale. Grouped by category, {sort_note}.</p>
<div class="cat">""")
        for cat, lst in cat_order[:6]:
            w(f'<h3>{e(cat)} <small>· {len(lst)} ready</small></h3><ul class="list">'
              + "".join(style_row(g, base, sym) for g in group_styles(lst)[:4]) + "</ul>")
        rest = [i for c, lst in cat_order[6:] for i in lst] + \
            [i for c, lst in cat_order[:6] for g in group_styles(lst)[4:] for i in g]
        if rest:
            w(f'<details><summary>Show the other {len(rest)} ready products</summary><ul class="list">'
              + "".join(product_row(i, base, sym, show_sizes=False) for i in rest) + "</ul></details>")
        w("</div></section>")

    # ---------------- 3. Check before you spend ----------------
    if s["sold_out"] or s["marked"]:
        w('<section><span class="tag t-chk">Check before you spend</span><h2>Two things that quietly eat into Black Friday budget and margin</h2>')
        if s["sold_out"]:
            w(f"""<h3 style="font-size:16px;margin:14px 0 4px">{len(s['sold_out'])} products are completely sold out but still live</h3>
<p class="why">Fine if they're coming back. But if any old ads, emails, influencer links or Shopping feeds still point at them, that traffic can't buy.</p>
<details><summary>Show the {len(s['sold_out'])} sold-out products</summary><ul class="list">{''.join(product_row(i, base, sym, show_sizes=False) for i in s['sold_out'][:60])}</ul>{'<p class="meta">…and ' + str(len(s['sold_out']) - 60) + ' more.</p>' if len(s['sold_out']) > 60 else ''}</details>""")
        if s["marked"]:
            d = s["median_depth"]
            stacked = 1 - (1 - d) * (1 - EXAMPLE_BF_CODE)
            w(f"""<h3 style="font-size:16px;margin:18px 0 4px">{len(s['marked'])} in-stock products are already marked down</h3>
<p class="why">The median markdown is <b>{pct(d)}</b>. If your Black Friday mechanic is a sitewide code that doesn't exclude sale items, a {pct(EXAMPLE_BF_CODE)} code on top takes a typical sale item to <b>{pct(stacked)} off</b>, with ad cost still to pay on each order. Worth deciding now whether sale lines are in or out.</p>
<details><summary>Show the deepest markdowns</summary><ul class="list">{''.join(product_row(i, base, sym, show_sizes=False) for i in s['marked'][:20])}</ul></details>""")
        w("</section>")

    # ---------------- 4. Category table ----------------
    rows = [r for r in s["cats"] if r[1]["n"] >= 3][:12] or s["cats"][:12]
    if len(rows) >= 2:
        w("""<section><span class="tag t-chk">By category</span><h2>Where the gaps are</h2>
<p class="why"><b>Sold out</b> = share of the category's variants (size/colour combinations) unavailable right now. <b>On sale</b> = share of its products with a compare-at price above the selling price.</p>
<div class="scroll"><table><thead><tr><th>Category</th><th>Sold out</th><th>On sale</th></tr></thead><tbody>""")
        for name, c in rows:
            vo = c["vo"] / c["v"] if c["v"] else 0
            md = c["md"] / c["n"] if c["n"] else 0
            w(f'<tr><td><b class="cn">{e(name)}</b><span class="meta">{c["n"]} products'
              f'{" · " + str(c["fix"]) + " missing a core size" if c["fix"] else ""}</span></td>'
              f'<td class="b">{pct(vo)}<div class="bar"><i style="width:{min(100, vo * 100):.0f}%"></i></div></td>'
              f'<td class="b">{pct(md)}<div class="bar md"><i style="width:{min(100, md * 100):.0f}%"></i></div></td></tr>')
        w("</tbody></table></div>")
        if s["new90"]:
            w(f'<div class="callout">You\'ve launched <b>{len(s["new90"])}</b> products in the last 90 days. '
              f'{len(s["new90_fix"])} of them are already sold out or missing a core size.</div>')
        w("</section>")

    # ---------------- 5. Who's counting ----------------
    if platforms:
        groups = {}
        for name, p in platforms.items():
            groups.setdefault(p["group"], []).append((name, p))
        w(f"""<section><span class="tag t-bridge">Who's counting your Black Friday</span>
<h2><span class="n">{len(reporting)}</span> platforms are set up to report their own version of your BFCM sales</h2>
<p class="why">We read the tags on your storefront and in your public Google Tag Manager container. Each ad, email and affiliate platform credits itself with orders that followed a click or view inside its own attribution window, and one order often has several of those. So on 1 December these platforms' revenue figures will usually add up to more than Shopify's actual sales, and they won't agree with each other. <b>Outlined</b> = platforms ASK BOSCO connects.</p>""")
        for g in ("ads", "email", "affiliate", "analytics", "reviews"):
            if g not in groups:
                continue
            w(f'<div class="grp"><h3>{GROUP_LABEL[g]}</h3>')
            for name, p in sorted(groups[g]):
                cls = " ab" if name in ASKBOSCO_CONNECTS else ""
                w(f'<span class="plat{cls}">{e(name)} <small>{e(" + ".join(p["sources"]))}</small></span>')
            w("</div>")
        if stack.get("unknown_app_pixels"):
            w(f'<p class="meta">Plus {stack["unknown_app_pixels"]} other Shopify app pixel(s) we couldn\'t identify by name.</p>')
        if stack.get("flags"):
            w('<h3 style="font-size:15px;margin:16px 0 6px">Tag housekeeping we spotted</h3><ul class="flags">'
              + "".join(f"<li>{e(f)}</li>" for f in stack["flags"]) + "</ul>")
        w('<p class="meta">A tag being present doesn\'t prove a channel has live spend. It shows the platform is wired into your site.</p></section>')

    # ---------------- 6. What this can't see ----------------
    ad_names = [n.split(" (")[0] for n in reporting if platforms.get(n, {}).get("group") == "ads"]
    ad_list = ", ".join(ad_names[:4]) if ad_names else "your ad platforms"
    w(f"""<section><span class="tag t-bridge">What this check can't see</span>
<h2>The answers that need your own data</h2>
<p class="why">Everything above comes from the outside. These are the questions it can't answer, and what ASK BOSCO answers once your store is connected.</p>
<div class="gap">
<div class="gaprow"><h3>Which Black Friday campaigns will actually make money?</h3><div class="two">
<div class="see"><b class="h">What we can see</b>Which products are in stock and at what price. Nothing about spend, margin or returns.</div>
<div class="ab-ans"><b class="h">ASK BOSCO</b>Joins your Shopify sales with spend from {e(ad_list)} in one place, so you can see which campaigns are actually profitable, not just which ones each platform says worked.</div></div></div>
<div class="gaprow"><h3>What did Black Friday 2025 really return, by channel?</h3><div class="two">
<div class="see"><b class="h">What we can see</b>Nothing. Last year's results aren't public.</div>
<div class="ab-ans"><b class="h">ASK BOSCO</b>Connecting your store pulls in historical data too, so last year's BFCM is there to compare against before this year's starts.</div></div></div>
<div class="gaprow"><h3>Which platform's Black Friday number do you believe?</h3><div class="two">
<div class="see"><b class="h">What we can see</b>{len(reporting) or 'Several'} platforms tagged to count your sales.</div>
<div class="ab-ans"><b class="h">ASK BOSCO</b>Shopify revenue next to what each platform claims, side by side, updated every hour through the weekend.</div></div></div>
<div class="gaprow"><h3>Are the sold-out sizes your best sellers?</h3><div class="two">
<div class="see"><b class="h">What we can see</b>In stock or not. No quantities, no sales.</div>
<div class="ab-ans"><b class="h">ASK BOSCO</b>Ask it in plain English, e.g. "what were our top 20 products by revenue in the last 30 days, and which channels did those orders come from?"</div></div></div>
</div></section>
<div class="cta"><h2>Run this on your real numbers</h2>
<p>Install ASK BOSCO from the Shopify App Store and connect {e(store)} in a few minutes. No sales call needed. 14-day free trial, then $199/month.</p>
<a class="btn" href="{APP_STORE_URL}" target="_blank" rel="noopener">Start the free trial on Shopify →</a>
<small>Or just reply to the email this came with and we'll answer any question about this report.</small></div>
""")

    # ---------------- footer: method ----------------
    w(f"""<footer><h3>How this was made</h3>
<ul>
<li>Catalogue: <code>{e(base)}/products.json</code>, fetched {ctx['fetched_at']}. {s['n']:,} products analysed; {ctx['excluded']} excluded (gift cards, shipping protection, non-physical items).</li>
<li>"Sold out" uses Shopify's public in-stock flag for each variant at that moment. Items on pre-order or set to keep selling when out of stock show as in stock. We can't see stock quantities, sales, or incoming stock.</li>
<li>"Core size" means S, M or L for letter sizes, otherwise the middle half of a product's size range. "Missing a core size" means every variant in that size is unavailable while other sizes are still in stock. For products without sizes, we flag the ones with half or more of their options sold out.</li>
<li>Markdowns compare each variant's price with its compare-at price. The stacking example uses an illustrative {pct(EXAMPLE_BF_CODE)} code. We don't know your Black Friday plans.</li>
{"<li>Review counts come from Yotpo's public API, as shown on each product page. Yotpo can group reviews across colourways, so several colours of one style may show the same count.</li>" if s['has_reviews'] else ""}
<li>Platforms: Shopify app pixels listed in your storefront code{(', plus your published GTM container(s) ' + ', '.join(stack['gtm_ids'])) if stack.get('gtm_ids') else ''}.</li>
<li>Everything here is public. It's a snapshot, not an audit, and it will be slightly out of date by the time you read it.</li>
</ul>
<p>ASK BOSCO® · <a href="https://askbosco.io">askbosco.io</a></p></footer>
</main></body></html>""")
    return "".join(out)


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

def load_logo():
    try:
        with open(os.path.join(HERE, "assets", "askbosco_logo_white.svg"), encoding="utf-8") as f:
            svg = f.read()
        svg = re.sub(r"<\?xml[^>]*\?>", "", svg).strip()
        return svg.replace("<svg ", '<svg role="img" aria-label="ASK BOSCO" ', 1)
    except OSError:
        return '<b style="font-size:22px;letter-spacing:.04em">ASK BOSCO®</b>'


def store_name(meta, page, domain):
    if isinstance(meta, dict) and meta.get("name"):
        return meta["name"].strip()
    if page:
        m = re.search(r'<meta[^>]+property="og:site_name"[^>]+content="([^"]+)"', page)
        if m:
            return html.unescape(m.group(1)).strip()
    return domain.split(".")[0].capitalize()


def run(domain, out_dir, today, log=print, save_raw=False):
    domain = normalise_domain(domain)
    base = f"https://{domain}"
    log(f"\n== {domain}")
    now = dt.datetime.combine(today, dt.time(9, 0), tzinfo=dt.timezone.utc)

    st, meta = fetch(f"{base}/meta.json", want_json=True)
    if st != 200 or not isinstance(meta, dict):
        log(f"  meta.json HTTP {st}: will fall back for name/currency")
        meta = {}
    if meta.get("domain"):
        base = f"https://{meta['domain']}"

    products = fetch_products(base, log)
    fetched_at = dt.datetime.now(dt.timezone.utc).strftime("%-d %b %Y, %H:%M UTC")
    stack = detect_stack(base, log)

    items, excluded = analyse(products, now)
    if len(items) < MIN_PRODUCTS:
        raise Skip(f"only {len(items)} physical products found, too few for a useful report")

    if stack.get("ok") and stack.get("yotpo_key"):
        prio = {"fix": 0, "ready": 1, "markdown": 2, "minor_gap": 3, "sold_out": 4}
        candidates = [i["id"] for i in sorted(items, key=lambda i: prio.get(i["status"], 9))]
        reviews = yotpo_counts(stack["yotpo_key"], candidates, log)
        if reviews and any(reviews.values()):
            items, excluded = analyse(products, now, reviews)

    s = summarise(items, now)
    bf = black_friday(today.year)
    if bf < today:
        bf = black_friday(today.year + 1)
    cur = meta.get("currency") or ""
    sym = CURRENCY.get(cur, (cur + " ") if cur else "")
    store = store_name(meta, stack.get("page"), domain)

    ctx = {
        "s": s, "stack": stack, "sym": sym, "base": base, "store": store, "domain": domain,
        "days_to_bf": (bf - today).days, "bf_date": bf, "logo": load_logo(), "excluded": excluded,
        "date_str": today.strftime("%-d %B %Y"), "fetched_at": fetched_at,
    }
    os.makedirs(out_dir, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", domain).strip("-")
    path = os.path.join(out_dir, f"{slug}.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(render(ctx))

    platforms = stack.get("platforms", {}) if stack.get("ok") else {}
    reporting = [k for k, v in platforms.items() if v["group"] in REPORTING_GROUPS] + \
        (["Google Analytics 4"] if "Google Analytics 4" in platforms else [])
    ex = example_product(s)
    issues = len(s["fix"]) + len(s["sold_out"])
    if s["n"] < SEND_MIN_PRODUCTS:
        verdict = f"hold: only {s['n']} products, report is thin"
    elif issues < SEND_MIN_ISSUES:
        verdict = "hold: stock looks clean, magnet has little to say"
    elif not reporting:
        verdict = "send (stack section empty)"
    else:
        verdict = "send"
    merge = {
        "domain": domain, "store": store, "status": "ok", "send": verdict, "report": path,
        "days_to_bf": ctx["days_to_bf"], "products": s["n"],
        "pct_variants_sold_out": round(s["pct_var_out"] * 100, 1),
        "n_fix": len(s["fix"]), "n_gaps": len(s["gaps"]), "n_nearly_gone": len(s["gone"]), "n_ready": len(s["ready"]), "n_sold_out": len(s["sold_out"]),
        "n_marked_down": len(s["marked"]), "median_markdown_pct": round(s["median_depth"] * 100),
        "example_product": ex["title"] if ex else "",
        "example_sizes_out": ", ".join(ex["core_out"]) if ex and ex["sized"] else "",
        "n_reporting_platforms": len(reporting),
        "reporting_platforms": "; ".join(sorted(reporting)),
        "currency": cur,
    }
    with open(os.path.join(out_dir, f"{slug}.json"), "w", encoding="utf-8") as f:
        json.dump(merge, f, indent=2)
    if save_raw:
        with open(os.path.join(out_dir, f"{slug}.products.json"), "w", encoding="utf-8") as f:
            json.dump({"meta": meta, "products": products}, f)
    log(f"  -> {path}  ({s['n']} products, {len(s['fix'])} fix, {len(s['ready'])} ready, "
        f"{len(reporting)} reporting platforms)")
    return merge


def main(argv=None):
    ap = argparse.ArgumentParser(description="ASK BOSCO Black Friday Stock & Spend Check")
    ap.add_argument("domains", nargs="*", help="Shopify store domains, e.g. wearetala.com")
    ap.add_argument("--from-file", help="text file with one domain per line")
    ap.add_argument("--out", default=os.path.join(HERE, "reports"), help="output folder")
    ap.add_argument("--date", help="report date YYYY-MM-DD (default: today)")
    ap.add_argument("--save-raw", action="store_true", help="also save the fetched catalogue JSON")
    a = ap.parse_args(argv)

    domains = list(a.domains)
    if a.from_file:
        with open(a.from_file, encoding="utf-8") as f:
            domains += [l.strip() for l in f if l.strip() and not l.startswith("#")]
    if not domains:
        ap.error("give at least one domain")
    today = dt.date.fromisoformat(a.date) if a.date else dt.date.today()

    rows = []
    for d in domains:
        try:
            rows.append(run(d, a.out, today, save_raw=a.save_raw))
        except Skip as ex:
            print(f"  SKIPPED: {ex}")
            rows.append({"domain": normalise_domain(d), "status": "skipped", "reason": str(ex)})
        except Exception as ex:  # one bad store must not kill a batch of thousands
            print(f"  ERROR: {type(ex).__name__}: {ex}")
            rows.append({"domain": normalise_domain(d), "status": "error", "reason": f"{type(ex).__name__}: {ex}"})
        time.sleep(1)

    os.makedirs(a.out, exist_ok=True)
    keys = []
    for r in rows:
        keys += [k for k in r if k not in keys]
    summary = os.path.join(a.out, "summary.csv")
    with open(summary, "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=keys)
        wr.writeheader()
        wr.writerows(rows)
    ok = sum(r["status"] == "ok" for r in rows)
    print(f"\nDone: {ok}/{len(rows)} reports. Mail-merge fields in {summary}")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
