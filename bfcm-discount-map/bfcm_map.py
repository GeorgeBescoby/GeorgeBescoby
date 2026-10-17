#!/usr/bin/env python3
"""BFCM Discount Map: how deep each product can be discounted before a paid
first order stops making money. Built only from public data.

Usage:
    python bfcm_map.py <domain> [--config brands/<domain>.json] [--skip-vat]
                                [--reuse-vat] [--today YYYY-MM-DD]

Steps:
  1. Product feed from /products.json (paged), filtered.
  2. Black Friday pages and collections, labelled "last year" or "live".
  3. VAT read from the checkout ("Including £X in taxes") with Playwright,
     falling back to UK rules. The cart is cleared afterwards. Nothing is
     ever typed into checkout.
  4. Breaking points, discount ladder and live offer cost.
  5. One self-contained HTML report plus a JSON dump in reports/.

An optional brand config (brands/<domain>.json) can name the brand, pin the
last-year and live offers, force products in, and override postage classes.
"""
import argparse
import datetime as dt
import html
import json
import re
import sys
import time
from statistics import median_low
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept-Language": "en-GB,en;q=0.9"}
CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
# Shopify converts prices to the visitor's local currency. Pin the store to GB/GBP.
GB_COOKIES = {"localization": "GB", "cart_currency": "GBP"}
SESSION = requests.Session()
SESSION.headers.update(UA)
SESSION.cookies.update(GB_COOKIES)

MARGINS = [0.40, 0.50, 0.60, 0.70]
LADDER = [0.0, 0.10, 0.20, 0.25, 0.30]
FEE_PCT, FEE_FIXED = 0.019, 0.25
ROAS_CAP = 50
N_FEATURED = 10

POSTAGE = {"letterbox": 2.50, "small": 3.50, "set": 5.00, "large": 15.00, "standard": 4.00}
POSTAGE_LABEL = {"letterbox": "Letterbox", "small": "Small box", "set": "Gift set / bundle",
                 "large": "Large item", "standard": "Standard parcel"}

BF_PAGES = ["/pages/blackfriday", "/pages/black-friday", "/pages/blackfriday-early-access",
            "/pages/black-friday-early-access", "/pages/cyber-monday"]
BF_COLLECTIONS = ["/collections/black-friday", "/collections/blackfriday",
                  "/collections/bfcm", "/collections/black-friday-sale"]

EXCLUDE_RE = r"gift ?card|e-?gift|voucher|\bsamples?\b|\bspare\b|replacement|\bparts?\b|diffuser head|\btester\b"
SET_RE = r"\b(gift|set|bundle|kit|duo|trio|collection|edit|hamper|box|pack|partners)\b"
LETTERBOX_RE = r"\b(roller ?ball|([1-9]|1[0-5]) ?ml|travel|mini|wash ?bag|socks?|card|patch|sachet|lip)\b"
SMALL_RE = (r"\b(oil|mist|cream|gel|lotion|wash|exfoliator|mask|cleanser|moisturiser|serum|"
            r"balm|butter|shampoo|conditioner|spray|treatment|candle|scrub|toner)\b")
LARGE_RE = r"\b(mattress|sofa|chair|table|bed frame|bike|bicycle|desk|wardrobe|rug)\b"
FOOD_RE = (r"\b(food|snack|coffee|tea|cereal|granola|chocolate|biscuit|sauce|pasta|nut|"
           r"protein|beans?|meat|cheese|drink|juice|bar|bars)\b")


# ---------------------------------------------------------------- maths

def contribution(P, V, m, d, post):
    S = P * (1 - d)
    net = S - V * (1 - d)
    cost = (P - V) * (1 - m)
    fees = FEE_PCT * S + FEE_FIXED
    return net - cost - fees - post


def breakeven_roas(P, V, m, d, post):
    c = contribution(P, V, m, d, post)
    return None if c <= 0 else P * (1 - d) / c


def breaking_point(P, V, m, post):
    """Discount d where contribution is exactly 0. Can be below 0 (no room
    even at full price)."""
    return 1 - ((P - V) * (1 - m) + FEE_FIXED + post) / ((P - V) - FEE_PCT * P)


def self_test():
    """The Grind reference numbers. The script refuses to run if these fail."""
    checks = [
        (round(breaking_point(29.95, 0, .5, 2.5) * 100), 40),
        (round(breakeven_roas(29.95, 0, .5, 0, 2.5), 1), 2.6),
        (round(breaking_point(14.95, 0, .5, 3.5) * 100), 23),
        (round(breaking_point(45, 6.54, .5, 5) * 100), 35),
        (round(breakeven_roas(29.95, 0, .5, .25, 2.5), 1), 5.2),
    ]
    for got, want in checks:
        assert got == want, f"maths self-test failed: {got} != {want}"


# ---------------------------------------------------------------- fetching

def get(url, tries=5, **kw):
    """GET with backoff on network errors, rate limits (429) and 5xx."""
    for i in range(tries):
        try:
            r = SESSION.get(url, timeout=25, **kw)
            if r.status_code != 429 and r.status_code < 500:
                return r
        except requests.RequestException:
            if i == tries - 1:
                raise
        if i < tries - 1:
            time.sleep(2 ** (i + 1))
    return r


def page_text(raw):
    t = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", raw)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"\s+", " ", t).strip()


def fetch_products(domain, path=""):
    out, n = [], 1
    while True:
        r = get(f"https://{domain}{path}/products.json?limit=250&page={n}")
        if not r.ok:
            break
        batch = r.json().get("products", [])
        if not batch:
            break
        out += batch
        n += 1
        if len(batch) < 250 or n > 40:
            break
    return out


def brand_name(domain):
    try:
        raw = get(f"https://{domain}/").text
        m = re.search(r'property="og:site_name"\s+content="([^"]+)"', raw)
        if m:
            return html.unescape(m.group(1)).strip()
    except Exception:
        pass
    return domain.split(".")[0].title()


# ---------------------------------------------------------------- products

def pick_variant(p):
    avail = [v for v in p["variants"] if v.get("available")]
    return (avail or p["variants"])[0]


def to_item(domain, p):
    v = pick_variant(p)
    price = float(v["price"] or 0)
    cap = float(v.get("compare_at_price") or 0)
    P = max(price, cap)
    return {
        "handle": p["handle"], "title": p["title"].strip(), "type": p.get("product_type") or "",
        "tags": p.get("tags") or [], "published_at": p.get("published_at") or "",
        "variant_id": v["id"], "grams": v.get("grams") or 0,
        "available": any(x.get("available") for x in p["variants"]),
        "price_now": price, "P": P,
        "live_markdown": round(1 - price / cap, 4) if cap > price > 0 else 0.0,
        "url": f"https://{domain}/products/{p['handle']}",
    }


def keep(item, extra_exclude=None):
    text = f"{item['title']} {item['type']} {' '.join(item['tags'])}".lower()
    if "hidden_product" in [t.lower() for t in item["tags"]]:
        return False
    if item["price_now"] <= 0 or item["price_now"] < 3:
        return False
    if re.search(EXCLUDE_RE, text):
        return False
    if extra_exclude and re.search(extra_exclude, item["title"], re.I):
        return False
    return True


def postage_class(item, overrides):
    if item["handle"] in overrides:
        return overrides[item["handle"]]
    title = item["title"].lower()
    text = f"{title} {item['type'].lower()}"
    g = item["grams"]
    if g >= 5000 or re.search(LARGE_RE, text):
        return "large"
    if re.search(SET_RE, text) or item["type"].lower() in ("sets", "gifting", "bundle", "bundles"):
        return "set"
    if (0 < g <= 150) or re.search(LETTERBOX_RE, title):
        return "letterbox"
    if (0 < g <= 750) or re.search(SMALL_RE, text):
        return "small"
    return "standard"


def choose_featured(items, bf_handles, include, n=N_FEATURED):
    by_handle = {i["handle"]: i for i in items}
    chosen = [by_handle[h] for h in include if h in by_handle]
    bf = sorted([i for i in items if i["handle"] in bf_handles and i["available"]],
                key=lambda i: i["published_at"], reverse=True)
    recent = sorted([i for i in items if i["available"] and i["handle"] not in bf_handles],
                    key=lambda i: i["published_at"], reverse=True)
    # One product per type first so the map covers the range, then relax.
    for cap in (1, 2, 99):
        for i in bf + recent:
            if len(chosen) >= n:
                return chosen
            ptype = i["type"] or "Gift set"
            if i in chosen or sum((c["type"] or "Gift set") == ptype for c in chosen) >= cap:
                continue
            chosen.append(i)
    return chosen


# ---------------------------------------------------------------- Black Friday offers

def parse_offer_text(text, this_year):
    low = text.lower()
    years = set()
    for m in re.finditer(r"\b(20\d\d)\b", text):
        ctx = low[max(0, m.start() - 60):m.end() + 20]
        if re.search(r"©|copyright|all rights reserved|gift guide|guide 20", ctx):
            continue
        if re.search(r"black friday|cyber|offer|sale|ends|until|valid|december|november|see you in", ctx):
            years.add(int(m.group(1)))
    pcts = []
    for m in re.finditer(r"(up to\s+)?(\d{1,2})\s?%\s*(off|savings?)?", text, re.I):
        ctx = text[max(0, m.start() - 80):m.end() + 80]
        if not (m.group(3) or re.search(r"off|save|saving|discount", ctx, re.I)):
            continue
        pcts.append({"pct": int(m.group(2)), "up_to": bool(m.group(1)),
                     "sitewide": bool(re.search(r"sitewide|site-wide|everything", ctx, re.I)),
                     "context": ctx.strip()})
    codes = sorted(set(re.findall(r"\b[Cc]ode:?\s+([A-Z0-9]{3,15})\b", text)))
    past = [y for y in years if y < this_year]
    ended = bool(re.search(r"sale ended|will return next year|offer (has )?ended|see you in", low))
    label = "last year" if (past and this_year not in years) or ended else (
        "live" if years or "early access" in low else "undated")
    return {"years": sorted(years), "pcts": pcts, "codes": codes, "label": label}


def probe_bf(domain, this_year):
    found = []
    for path in BF_PAGES + BF_COLLECTIONS:
        url = f"https://{domain}{path}"
        try:
            r = get(url, allow_redirects=True)
        except Exception:
            continue
        if not r.ok or not r.url.split("?")[0].rstrip("/").endswith(path.split("/")[-1]):
            continue
        rec = {"url": url, "kind": "page" if path.startswith("/pages") else "collection"}
        rec.update(parse_offer_text(page_text(r.text), this_year))
        if rec["kind"] == "collection":
            prods = fetch_products(domain, path)
            if not prods:
                print(f"  WARNING {url} returned no products. Featured picks will skip it.",
                      file=sys.stderr)
            rec["handles"] = [p["handle"] for p in prods]
            marks = []
            for p in prods:
                it = to_item(domain, p)
                if it["live_markdown"] > 0 and it["available"]:
                    marks.append({"handle": it["handle"], "title": it["title"], "was": it["P"],
                                  "now": it["price_now"], "pct": round(it["live_markdown"] * 100)})
            rec["live_markdowns"] = marks
        found.append(rec)
    return found


def homepage_claims(domain, this_year):
    try:
        r = get(f"https://{domain}/")
        info = parse_offer_text(page_text(r.text), this_year)
        return {"url": f"https://{domain}/", "pcts": info["pcts"][:12], "codes": info["codes"]}
    except Exception:
        return {"url": f"https://{domain}/", "pcts": [], "codes": []}


# ---------------------------------------------------------------- VAT

def vat_rules(item):
    text = f"{item['title']} {item['type']}".lower()
    if re.search(FOOD_RE, text):
        return 0.0, "UK rules: food and drink zero-rated (estimated)"
    est = " (bundle, estimated)" if re.search(SET_RE, text) else ""
    return round(item["P"] / 6, 2), "UK rules: 20% standard rate" + est


def read_vat(domain, items):
    """Open /cart/<variant>:1 for each item and read 'Including £X in taxes'.
    Reads only. Never types into checkout. Clears the cart afterwards."""
    results = {}
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("  playwright not installed, using UK rules", file=sys.stderr)
        return results
    host = domain.removeprefix("www.")
    with sync_playwright() as pw:
        kw = {"args": ["--no-sandbox"]}
        if Path(CHROMIUM).exists():
            kw["executable_path"] = CHROMIUM
        browser = pw.chromium.launch(**kw)
        for it in items:
            for attempt in range(3):
                # A fresh context per read: Shopify throttles repeat checkouts in one session.
                ctx = browser.new_context(locale="en-GB", user_agent=UA["User-Agent"])
                ctx.add_cookies([{"name": k, "value": v, "domain": "." + host, "path": "/"}
                                 for k, v in GB_COOKIES.items()])
                page = ctx.new_page()
                try:
                    page.goto(f"https://{domain}/cart/{it['variant_id']}:1?country=GB",
                              wait_until="domcontentloaded", timeout=60000)
                    body, m = "", None
                    # The tax line renders after the subtotal, so wait for it.
                    for _ in range(25):
                        page.wait_for_timeout(1000)
                        body = page.inner_text("body")
                        m = re.search(r"Including\s*£\s*([\d,]+\.\d\d)\s*in taxes", body)
                        if m:
                            break
                    sub = re.search(r"Subtotal\s*£\s*([\d,]+\.\d\d)", body)
                    if sub and abs(float(sub.group(1).replace(",", "")) - it["price_now"]) > 0.02:
                        print(f"  WARNING {it['handle']}: checkout subtotal £{sub.group(1)} does not "
                              f"match feed price £{it['price_now']:.2f}. Check currency.", file=sys.stderr)
                    if m:
                        results[it["handle"]] = float(m.group(1).replace(",", ""))
                    elif sub:
                        results[it["handle"]] = 0.0
                except Exception as e:
                    print(f"  VAT attempt {attempt + 1} failed for {it['handle']}: {e}", file=sys.stderr)
                finally:
                    try:
                        page.goto(f"https://{domain}/cart/clear", timeout=30000)
                    except Exception:
                        pass
                    ctx.close()
                if it["handle"] in results:
                    break
                time.sleep(4)
            print(f"  VAT {it['title'][:40]:40} {results.get(it['handle'])}", file=sys.stderr)
        browser.close()
    return results


# ---------------------------------------------------------------- formatting

def money(x):
    return f"£{x:,.0f}" if abs(x - round(x)) < 0.005 else f"£{x:,.2f}"


def pct(x):
    return f"{round(x * 100)}%"


def roas_txt(r):
    if r is None:
        return "never"
    return f"{ROAS_CAP}×+" if r > ROAS_CAP else f"{r:.1f}×"


def bp_txt(d):
    return "no room" if d <= 0 else pct(d)


def nice_date(d):
    return f"{d.day} {d.strftime('%B %Y')}"


def black_friday(year):
    nov1 = dt.date(year, 11, 1)
    thanksgiving = nov1 + dt.timedelta(days=(3 - nov1.weekday()) % 7 + 21)
    return thanksgiving + dt.timedelta(days=1)


# ---------------------------------------------------------------- analysis

def analyse(domain, cfg, today, skip_vat=False, reuse_vat=None):
    this_year = today.year
    print(f"Fetching products for {domain}", file=sys.stderr)
    raw = fetch_products(domain)
    items = [to_item(domain, p) for p in raw]
    items = [i for i in items if keep(i, cfg.get("exclude_regex"))]
    print(f"  {len(raw)} products, {len(items)} after filters", file=sys.stderr)

    print("Checking Black Friday pages and collections", file=sys.stderr)
    bf = probe_bf(domain, this_year)
    bf_handles = set()
    for rec in bf:
        bf_handles.update(rec.get("handles", []))
    home = homepage_claims(domain, this_year)

    live = cfg.get("live_offer")
    include = list(cfg.get("include", []))
    if live and live.get("product") and live["product"] not in include:
        include.insert(0, live["product"])
    featured = choose_featured(items, bf_handles, include)

    vat_read = dict(reuse_vat or {})
    if not skip_vat:
        todo = [i for i in featured if i["handle"] not in vat_read]
        if todo:
            print(f"Reading VAT at checkout for {len(todo)} products", file=sys.stderr)
            vat_read.update(read_vat(domain, todo))

    rows = []
    for it in featured:
        if it["handle"] in vat_read:
            v_now = vat_read[it["handle"]]
            # Checkout shows VAT on today's price. Scale to full price.
            V = round(v_now * it["P"] / it["price_now"], 2) if it["price_now"] else v_now
            method = "Checkout" + (f" (£{v_now:.2f} at today's £{it['price_now']:.2f}, scaled to full price)"
                                   if it["live_markdown"] else "")
        else:
            V, method = vat_rules(it)
        post_cls = postage_class(it, cfg.get("postage_overrides", {}))
        post = POSTAGE[post_cls]
        row = dict(it, V=V, vat_method=method, vat_checkout=vat_read.get(it["handle"]),
                   postage_class=post_cls, postage=post,
                   in_bf_collection=it["handle"] in bf_handles)
        row["bp"] = {f"{int(m*100)}": breaking_point(it["P"], V, m, post) for m in MARGINS}
        row["ladder"] = {f"{int(d*100)}": breakeven_roas(it["P"], V, 0.5, d, post) for d in LADDER}
        rows.append(row)

    offer_cost = None
    if live and live.get("pct"):
        r = next((x for x in rows if x["handle"] == live.get("product")), None)
        if r:
            d = live["pct"] / 100
            offer_cost = {"product": r["title"], "handle": r["handle"], "pct": live["pct"],
                          "P": r["P"], "S": r["P"] * (1 - d),
                          "roas": {f"{int(m*100)}": breakeven_roas(r["P"], r["V"], m, d, r["postage"])
                                   for m in MARGINS},
                          "contribution50": contribution(r["P"], r["V"], .5, d, r["postage"])}

    return {"domain": domain, "brand": cfg.get("brand_name") or brand_name(domain),
            "date": today.isoformat(), "n_products_feed": len(raw), "n_products_kept": len(items),
            "bf_sources": bf, "homepage": home, "last_year_offer": cfg.get("last_year_offer"),
            "live_offer": live, "offer_cost": offer_cost, "rows": rows,
            "vat_read": vat_read, "extra_sources": cfg.get("extra_sources", [])}


def findings(data):
    rows, out = data["rows"], []
    oc, live, ly = data["offer_cost"], data["live_offer"], data["last_year_offer"]
    bp50 = sorted(rows, key=lambda r: r["bp"]["50"])

    if oc:
        r40, r50, r60 = oc["roas"]["40"], oc["roas"]["50"], oc["roas"]["60"]
        body = (f"{oc['product']} is {oc['pct']}% off right now, at {money(oc['S'])} instead of "
                f"{money(oc['P'])}. At 50% margin, a paid first order at that price needs "
                f"{roas_txt(r50)} ROAS to break even. ")
        body += ("At 40% margin it never pays back. " if r40 is None else
                 f"At 40% margin it needs {roas_txt(r40)}. ")
        body += f"At 60% it needs {roas_txt(r60)}."
        if live.get("free_gift"):
            body += (f" This leaves out the cost of the {live['free_gift']}, "
                     "so the real number is higher.")
        out.append({"tag": "Live offer", "big": roas_txt(r50),
                    "big_note": "ROAS to break even at 50% margin",
                    "title": f"Your {live.get('short', str(oc['pct']) + '% off')} needs {roas_txt(r50)} ROAS",
                    "body": body, "strip": oc["roas"]})

    if ly and ly.get("pct"):
        d = ly["pct"] / 100
        inf = float("inf")
        at_ly = sorted(breakeven_roas(r["P"], r["V"], .5, d, r["postage"]) or inf for r in rows)
        at_full = sorted(r["ladder"]["0"] or inf for r in rows)
        med_ly, med_full = median_low(at_ly), median_low(at_full)
        show = lambda x: roas_txt(None if x == inf else x)
        room = median_low(sorted(round((r["bp"]["50"] - d) * 100) for r in rows))
        under = [r["title"] for r in rows if r["bp"]["50"] < d]
        near = [r["title"] for r in rows if 0 <= r["bp"]["50"] - d < 0.05]
        body = (f"Last year you ran {ly['name']}. At today's prices and 50% margin, the typical product here needs "
                f"{show(med_full)} ROAS at full price for a paid first order to break even. "
                f"At {ly['pct']}% off it needs {show(med_ly)}, and the typical product is left with about "
                f"{room} points of discount before its breaking point.")
        tail = []
        if under:
            tail.append(f"{' and '.join(under)} would have no room left at all")
        if near:
            tail.append(f"{' and '.join(near)} would have less than 5 points")
        if tail:
            body += f" At {ly['pct']}% off, " + ", and ".join(tail) + "."
        if ly.get("exclusions"):
            body += " Exclusions applied last year, so some of these may not have been in it."
        out.append({"tag": "Last year", "big": show(med_ly),
                    "big_note": f"typical ROAS needed at {ly['pct']}% off, against {show(med_full)} at full price",
                    "title": f"Last year's {ly['pct']}% off, run today, takes the typical product from "
                             f"{show(med_full)} to {show(med_ly)} ROAS",
                    "body": body})

    first = bp50[0]
    lvl = max(first["bp"]["50"], 0)
    others = [breakeven_roas(r["P"], r["V"], .5, lvl, r["postage"]) for r in rows if r is not first]
    others = [x for x in others if x]
    body = (f"{first['title']} ({money(first['P'])}) runs out of room first. At 50% margin it has "
            f"nothing left for ads past {bp_txt(first['bp']['50'])} off. Product cost, VAT, "
            f"fees and {money(first['postage'])} postage take the rest. ")
    if others:
        body += (f"A sitewide {pct(lvl)} code would leave nothing to pay for the ads that sell it, while the "
                 f"other products would need between {roas_txt(min(others))} and "
                 f"{roas_txt(max(others))} ROAS.")
    out.append({"tag": "First to run out", "big": bp_txt(first["bp"]["50"]),
                "big_note": f"deepest discount for {first['title']} at 50% margin",
                "title": f"{first['title']} runs out of room first", "body": body})

    if len(out) < 3:
        hi, lo = bp50[-1], bp50[0]
        out.append({"tag": "Biggest gap", "big": f"{round((hi['bp']['50'] - lo['bp']['50']) * 100)} pts",
                    "big_note": "gap between your deepest and shallowest product",
                    "title": "One discount does not fit the range",
                    "body": f"At 50% margin, {hi['title']} can go to {pct(hi['bp']['50'])} off. "
                            f"{lo['title']} stops at {bp_txt(lo['bp']['50'])}."})
    return out[:3]


# ---------------------------------------------------------------- HTML

CSS = """
:root{--indigo:#1f0a4f;--purple:#7a0bea;--yellow:#ffd500;--page:#f3f3f6;--card:#fff;--ink:#1d1b26;
--muted:#666577;--line:#e7e6ee;--r1:#fbe3e3;--r1t:#a31b1b;--r2:#fff1cc;--r2t:#7a5800;--g1:#e9f7ee;--g1t:#1b6e3a;--g2:#d3f0de;--g2t:#135a2e}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--page);color:var(--ink);font:15px/1.6 Poppins,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--purple)}
.wrap{max-width:920px;margin:0 auto;padding:0 16px}
header.hero{background:var(--indigo);color:#fff;padding:24px 0 56px}
.logo svg{height:28px;width:auto;display:block}
.kicker{display:inline-block;margin-top:28px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#cbbcf2}
.hero h1{font-weight:800;font-size:clamp(27px,5.6vw,42px);line-height:1.15;margin:8px 0 12px;max-width:760px}
.hero p.intro{color:#e3dcf7;margin:0;max-width:680px;font-size:15.5px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.chip{background:rgba(255,255,255,.1);color:#fff;border-radius:99px;padding:5px 12px;font-size:12.5px}
main{margin-top:-32px}
.panel{background:var(--card);border-radius:18px;padding:22px;margin:0 0 16px;box-shadow:0 2px 14px rgba(31,10,79,.06)}
h2{font-weight:800;font-size:21px;line-height:1.25;margin:0 0 6px}
.sub{color:var(--muted);font-size:14px;margin:0 0 16px}
.findings{display:grid;gap:12px;grid-template-columns:1fr}
@media(min-width:780px){.findings{grid-template-columns:repeat(3,1fr)}}
.finding{border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column}
.ftag{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.big{font-size:38px;font-weight:800;color:var(--purple);line-height:1.1;margin:8px 0 2px}
.bignote{font-size:12px;color:var(--muted);margin-bottom:10px}
.finding h3{font-size:15.5px;font-weight:600;line-height:1.35;margin:0 0 6px}
.finding p{font-size:14px;margin:0}
.strip{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}
.strip div{background:var(--page);border-radius:10px;padding:6px 4px;text-align:center;font-size:11.5px;color:var(--muted)}
.strip b{display:block;font-size:15px;color:var(--ink)}
.howto{background:#f4ecfe;border-radius:12px;padding:14px 16px;font-size:14px;margin:0 0 16px}
.howto b{color:var(--indigo)}
.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -6px;padding:0 6px}
table{border-collapse:separate;border-spacing:0 6px;width:100%;min-width:560px;font-size:14px}
th{font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);text-align:center;padding:4px 6px;white-space:nowrap}
th:first-child{text-align:left}
td{padding:9px 8px;text-align:center;font-weight:600;white-space:nowrap}
td.p{text-align:left;font-weight:400;white-space:normal;min-width:180px;border-bottom:1px solid var(--line)}
td.p a{color:var(--ink);font-weight:600;text-decoration:none}
td.p a:hover{color:var(--purple)}
td.p .m{display:block;font-size:12px;color:var(--muted)}
th.hl{color:var(--purple)}
.c{border-radius:8px}
.c0{background:var(--r1);color:var(--r1t)} .c1{background:var(--r2);color:var(--r2t)}
.c2{background:var(--g1);color:var(--g1t)} .c3{background:var(--g2);color:var(--g2t)}
.legend{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--muted);margin-top:8px}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:12px;height:12px;border-radius:3px;display:inline-block}
ul.plain{margin:0;padding-left:18px} ul.plain li{margin:0 0 8px}
.cta{background:var(--indigo);color:#fff}
.cta h2{color:#fff}
.cta p{color:#e3dcf7;margin:0 0 12px}
.btn{display:inline-block;background:var(--yellow);color:var(--indigo);font-weight:600;text-decoration:none;padding:12px 24px;border-radius:99px;margin-top:6px}
.dates{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 14px}
.dates span{background:rgba(255,255,255,.1);border-radius:99px;padding:5px 12px;font-size:13px}
.assume{font-size:13.5px;color:#3d3b4a}
.assume li{margin-bottom:6px}
.assume a{word-break:break-all}
.sig{text-align:center;color:var(--muted);font-size:13px;padding:8px 0 36px}
@media(max-width:600px){.panel{padding:18px 14px}table{min-width:0;font-size:13px;border-spacing:0 4px}
td{padding:8px 3px}td.p{min-width:118px;font-size:12.5px}td.p .m{font-size:11px}
th{font-size:10px;padding:4px 2px;white-space:normal}}
"""


def cell_bp(d):
    cls = "c0" if d < 0.15 else "c1" if d < 0.25 else "c2" if d < 0.35 else "c3"
    return f'<td class="c {cls}">{bp_txt(d)}</td>'


def cell_roas(r):
    cls = "c0" if (r is None or r >= 10) else "c1" if r >= 5 else "c2" if r >= 3 else "c3"
    return f'<td class="c {cls}">{roas_txt(r)}</td>'


def render(data, logo_svg, today):
    e = html.escape
    rows, F = data["rows"], findings(data)
    data["findings"] = F
    brand, domain = data["brand"], data["domain"]
    bf_day = black_friday(today.year)
    cm_day = bf_day + dt.timedelta(days=3)
    install = cm_day - dt.timedelta(days=13)

    prodcell = lambda r: (f'<td class="p"><a href="{e(r["url"])}">{e(r["title"])}</a>'
                          f'<span class="m">{money(r["P"])} · VAT {money(r["V"])} · '
                          f'{POSTAGE_LABEL[r["postage_class"]].lower()} {money(r["postage"])}</span></td>')
    bp_rows = "".join("<tr>" + prodcell(r) + "".join(cell_bp(r["bp"][f"{int(m*100)}"]) for m in MARGINS)
                      + "</tr>" for r in sorted(rows, key=lambda r: r["bp"]["50"]))
    lad_rows = "".join("<tr>" + prodcell(r) + "".join(cell_roas(r["ladder"][f"{int(d*100)}"]) for d in LADDER)
                       + "</tr>" for r in sorted(rows, key=lambda r: r["bp"]["50"]))

    def fcard(f):
        strip = ""
        if f.get("strip"):
            strip = '<div class="strip">' + "".join(
                f'<div><b>{roas_txt(v)}</b>{k}% margin</div>' for k, v in f["strip"].items()) + "</div>"
        return (f'<div class="finding"><span class="ftag">{e(f["tag"])}</span>'
                f'<div class="big">{e(f["big"])}</div><div class="bignote">{e(f["big_note"])}</div>'
                f'<h3>{e(f["title"])}</h3><p>{e(f["body"])}</p>{strip}</div>')

    # Sources
    src = [(f"https://{domain}/products.json", f"Product feed ({data['n_products_feed']} products, "
                                                f"{data['n_products_kept']} after filters)")]
    for rec in data["bf_sources"]:
        bits = []
        if rec.get("years"):
            bits.append("names " + ", ".join(map(str, rec["years"])))
        if rec.get("codes"):
            bits.append("code " + ", ".join(rec["codes"]))
        desc = f"Black Friday {rec['kind']}. Page text labelled {rec['label']}"
        desc += f" ({'; '.join(bits)})." if bits else "."
        if rec.get("live_markdowns"):
            desc += f" {len(rec['live_markdowns'])} in-stock products marked down today (live)."
        src.append((rec["url"], desc))
    for o, lab in ((data["last_year_offer"], "last year"), (data["live_offer"], "live")):
        if o and o.get("url") and o["url"] not in [s[0] for s in src]:
            src.append((o["url"], f"{o['name']} ({lab})"))
    for s in data["extra_sources"]:
        src.append((s["url"], s["label"]))
    src.append((f"https://{domain}/cart/<variant_id>:1", "Checkout, read for the VAT line only. "
                "No details entered. Cart cleared after each read."))
    src_html = "".join(f'<li><a href="{e(u)}">{e(u)}</a>: {e(l)}</li>' for u, l in src)

    vat_methods = sorted({("checkout" if r["vat_checkout"] is not None else "UK rules") for r in rows})
    ly, live = data["last_year_offer"], data["live_offer"]
    offer_lines = ""
    if ly:
        offer_lines += f"<li>Last year: {e(ly['name'])}. {e(ly.get('evidence', ''))}</li>"
    if live:
        offer_lines += f"<li>Live now: {e(live['name'])}. {e(live.get('evidence', ''))}</li>"

    margin_head = "".join(f'<th class="{"hl" if m == .5 else ""}">{int(m*100)}% margin</th>' for m in MARGINS)
    ladder_head = "".join(f"<th>{'Full price' if d == 0 else str(int(d*100)) + '% off'}</th>" for d in LADDER)
    first = sorted(rows, key=lambda r: r["bp"]["50"])[0]
    top = sorted(rows, key=lambda r: r["bp"]["50"])[-1]
    example = re.sub(r"^the\s+", "", data["offer_cost"]["product"], flags=re.I) if data["offer_cost"] else "Black Friday"

    return f"""<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>{e(brand)} BFCM Discount Map · ASK BOSCO</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&display=swap" rel="stylesheet">
<style>{CSS}</style></head>
<body>
<header class="hero"><div class="wrap">
<div class="logo">{logo_svg}</div>
<div class="kicker">BFCM Discount Map · Prepared for {e(brand)}</div>
<h1>How deep each of your products can go this Black Friday</h1>
<p class="intro">For {len(rows)} of your products, this map shows the deepest discount where a paid first order still covers its costs. Past that point there is nothing left to pay for the ad that brought the customer in. It is built only from public data.</p>
<div class="chips"><span class="chip">{e(domain)}</span><span class="chip">{nice_date(today)}</span><span class="chip">Sources: product feed, checkout VAT, Black Friday pages</span></div>
</div></header>
<main class="wrap">

<section class="panel">
<h2>Three things stand out</h2>
<p class="sub">All at 50% margin unless stated. Your real margin moves every number. If yours is higher, read the 60% or 70% column in the table below and the numbers get easier.</p>
<div class="findings">{''.join(fcard(f) for f in F)}</div>
</section>

<section class="panel">
<h2>Breaking point by product</h2>
<p class="sub">The deepest discount before a paid first order makes nothing.</p>
<div class="howto"><b>How to read it.</b> Pick the column closest to your margin. The number is the discount where a first order covers product cost, VAT, payment fees and postage, with £0 left for ads. Go deeper and that order loses money before any ad spend. For example, at 50% margin {e(first['title'])} stops at {bp_txt(first['bp']['50'])} off, while {e(top['title'])} can go to {pct(top['bp']['50'])}.</div>
<div class="tablewrap"><table><thead><tr><th>Product</th>{margin_head}</tr></thead><tbody>{bp_rows}</tbody></table></div>
<div class="legend"><span><i class="c0"></i>under 15%</span><span><i class="c1"></i>15 to 24%</span><span><i class="c2"></i>25 to 34%</span><span><i class="c3"></i>35% or more</span></div>
</section>

<section class="panel">
<h2>Discount ladder</h2>
<p class="sub">The ROAS a paid first order needs to break even at 50% margin, at each discount level. "Never" means the order loses money before ads.</p>
<div class="tablewrap"><table><thead><tr><th>Product</th>{ladder_head}</tr></thead><tbody>{lad_rows}</tbody></table></div>
<div class="legend"><span><i class="c3"></i>under 3×</span><span><i class="c2"></i>3 to 5×</span><span><i class="c1"></i>5 to 10×</span><span><i class="c0"></i>10× or more, or never</span></div>
</section>

<section class="panel">
<h2>What this can't tell you</h2>
<ul class="plain">
<li><b>Your real margin.</b> We can see prices and VAT. We can't see what each product costs you to make, so every number is shown across a range of margins.</li>
<li><b>Your live ROAS per product during the sale.</b> The map says what each discount needs. Only your ad and order data can say what each product is getting, hour by hour, while the sale runs.</li>
<li><b>Whether the first-order offer pays back.</b> A first order that loses money can still be worth it if the customer comes back. That depends on your repeat rate, which only your store data shows.</li>
</ul>
</section>

<section class="panel cta">
<h2>This map stops where your own data starts</h2>
<p>Every number above uses a guessed margin and no ad data. ASK BOSCO joins your Shopify, ad and marketing data in one place, so you can ask a question like "did the {e(example)} offer pay for its ads yesterday?" in plain English and get an answer from your own numbers. Data updates every hour, so you can check while the sale is running. Connecting your store pulls in your historical data too.</p>
<div class="dates"><span>Install on {install.strftime('%A')} {install.day} {install.strftime('%B')}</span><span>Black Friday {bf_day.day} {bf_day.strftime('%B')}</span><span>Cyber Monday {cm_day.day} {cm_day.strftime('%B')}</span></div>
<p>Install on {install.day} {install.strftime('%B')} and the 14-day free trial runs through Black Friday to Cyber Monday. After that it is $199 a month.</p>
<a class="btn" href="https://apps.shopify.com/ask-bosco">Start your free trial</a>
</section>

<section class="panel assume">
<h2>Assumptions and sources</h2>
<ul class="plain">
<li>List price is the full price in your product feed. Where a product is marked down today, the compare-at price is used.</li>
<li>VAT at full price is read from your checkout's "Including £X in taxes" line ({' and '.join(vat_methods)}). Where checkout showed a sale price, the VAT is scaled up to full price.</li>
<li>Sale price = list price × (1 − discount). Net revenue = sale price − VAT × (1 − discount).</li>
<li>Product cost = (list price − VAT) × (1 − margin). It stays the same whatever the discount.</li>
<li>Payment fees = 1.9% of the sale price + £0.25.</li>
<li>Postage per order: £2.50 letterbox, £3.50 small boxed, £5 gift sets and bundles, £15 large items, £4 otherwise. Classes are our guess from the product name and type.</li>
<li>Contribution = net revenue − product cost − fees − postage. Break-even ROAS = sale price ÷ contribution. Breaking point = the discount where contribution is £0. Anything above 50× is shown as 50×+.</li>
<li>One unit per order, no free delivery threshold, no returns. Free gifts with purchase are left out, which flatters the numbers.</li>
<li>Featured products: your Black Friday collection first, newest first, in stock, one per product type, plus the product in your live offer. Gift cards, samples, spare parts, hidden products and anything under £3 are left out.</li>
{offer_lines}
{src_html}
</ul>
</section>

<div class="sig">Prepared by George Bescoby · ASK BOSCO</div>
</main>
</body></html>
"""


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("domain")
    ap.add_argument("--config", help="brand config JSON (default: brands/<domain>.json if present)")
    ap.add_argument("--skip-vat", action="store_true", help="skip checkout, use UK VAT rules")
    ap.add_argument("--reuse-vat", action="store_true", help="reuse VAT readings from the last JSON run")
    ap.add_argument("--today", help="report date, YYYY-MM-DD (default: today)")
    ap.add_argument("--out", default=str(HERE / "reports"))
    a = ap.parse_args()

    self_test()
    domain = re.sub(r"^https?://", "", a.domain).strip("/")
    today = dt.date.fromisoformat(a.today) if a.today else dt.date.today()
    cfg_path = Path(a.config) if a.config else HERE / "brands" / f"{domain}.json"
    cfg = json.loads(cfg_path.read_text()) if cfg_path.exists() else {}

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    slug = domain.replace(".", "-")
    json_path = out / f"bfcm-discount-map-{slug}.json"
    prior = None
    if a.reuse_vat and json_path.exists():
        prior = json.loads(json_path.read_text()).get("vat_read")

    data = analyse(domain, cfg, today, skip_vat=a.skip_vat, reuse_vat=prior)
    logo = (HERE / "assets" / "askbosco_logo_white.svg").read_text()
    logo = re.sub(r"<\?xml[^>]*\?>", "", logo).strip()
    page = render(data, logo, today)
    assert "—" not in page, "em-dash found in report"
    html_path = out / f"bfcm-discount-map-{slug}.html"
    html_path.write_text(page)
    json_path.write_text(json.dumps(data, indent=2, default=str))

    print(f"\n{data['brand']} ({domain})")
    print(f"{'Product':44} {'P':>8} {'VAT':>7} post  " + "  ".join(f"bp{int(m*100)}" for m in MARGINS))
    for r in sorted(data["rows"], key=lambda r: r["bp"]["50"]):
        print(f"{r['title'][:44]:44} {r['P']:8.2f} {r['V']:7.2f} {r['postage']:4.2f}  "
              + "  ".join(f"{bp_txt(r['bp'][str(int(m*100))]):>4}" for m in MARGINS))
    for f in data["findings"]:
        print(f"\n[{f['tag']}] {f['big']}: {f['title']}\n  {f['body']}")
    print(f"\nWrote {html_path}\nWrote {json_path}")


if __name__ == "__main__":
    main()
