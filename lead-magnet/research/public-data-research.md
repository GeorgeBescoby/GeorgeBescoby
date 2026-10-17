# What public data can we get on a Shopify brand?

Tested live on **17 Oct 2026** against real stores: TALA (wearetala.com), Allbirds, Gymshark, Snag Tights, Huel, Grind, Pip & Nut and Lounge. Every result below comes from a request I actually made. I was running from a cloud sandbox behind an egress proxy, so a few blocks may be specific to this environment. Those are marked **(env)**.

## 1. The store itself: open, structured, reliable

| Source | What it gives you | Reliability in testing |
|---|---|---|
| `/products.json?limit=250&page=N` | Every published product: title, handle, `product_type`, vendor, tags, `created_at` / `published_at` / `updated_at`, images, options (Size, Colour, Leg length…), and per variant: `price`, `compare_at_price`, `available` (true/false), SKU, grams | ✅ TALA, Allbirds, Gymshark, Snag. Pages of 250, keep paging until empty. Huel returns **404**: headless or locked-down stores turn it off. Snag returned **503** on the first hit and 200 on the retry, so Shopify rate-limits and the script must back off and retry. |
| `/meta.json` | Store name, city, country, **currency**, `published_products_count`, `published_collections_count`, ships-to countries, Shop Pay Installments on or off | ✅ on most stores. 503 under rate limiting. |
| `/collections.json` | Collection names, handles and update times | ✅ |
| `/collections/all?sort_by=best-selling` (HTML) | In theory, Shopify's real sales-ranked order | ❌ **Not reliable.** TALA returned 500. On Allbirds it came back in the same order as `title-ascending`, so search/merchandising apps override it. The JSON version ignores `sort_by`. **There's no dependable public sales ranking.** |
| `/cart.js` | Empty cart object | Useless |
| `robots.txt`, `sitemap.xml` | Sitemap index, product sitemaps with `lastmod` | ✅, but it only duplicates products.json |
| `/policies/shipping-policy` | Policy text (sometimes includes the free-shipping threshold) | ⚠️ Free text, and the threshold often isn't in it. Regex on TALA's homepage found nothing. |

**What products.json can't tell you:** stock *quantity* (only in/out), sales, cost, margin, which products are best-sellers. Some caveats on `available`: it's `true` when a store allows overselling or pre-orders, and some themes hide sold-out variants entirely.

**Scale check:** TALA = 911 products / 5,359 variants over 4 pages. That's about 5 requests and 6 MB, so it's cheap enough to run on thousands of brands.

## 2. The marketing stack: surprisingly open

| Source | What it gives you | Reliability |
|---|---|---|
| Homepage HTML → `webPixelsConfigList` | Shopify's own list of **app pixels** installed through Customer Events. The configuration keys identify the app (`tagID` → Pinterest, `accountID` → Klaviyo, `pixel_id` → Meta, `pixelCode` → TikTok, `yotpoStoreId` → Yotpo…) | ✅ Present on every Shopify storefront I fetched. |
| Homepage HTML → inline IDs | `GTM-XXXX`, `G-XXXX` (GA4), `AW-XXXX` (Google Ads), plus script hosts for Klaviyo, Awin, Gorgias, Yotpo, Judge.me, Okendo… | ✅ |
| `googletagmanager.com/gtm.js?id=GTM-XXXX` | **The full published GTM container.** On TALA it exposed GA4, Google Ads, Meta, TikTok, Pinterest, Microsoft/Bing UET, Awin, Klaviyo, Hotjar, Clarity, plus a legacy Universal Analytics ID | ✅ Public by design. Caveat: a tag in the container doesn't prove the tag fires, or that the channel has live spend. |

This is the only public source that shows **which ad and marketing platforms a brand is wired into**. That happens to be ASK BOSCO's integration list.

## 3. Ad libraries: mostly blocked or unreliable

| Source | Result |
|---|---|
| Meta Ad Library website | ❌ **403** (needs a JS-rendered session) |
| Meta Ad Library API (`graph.facebook.com/ads_archive`) | ❌ Needs a verified access token. Unauthenticated → OAuthException. From memory, not re-verified: commercial ads are only covered for EU delivery (DSA). |
| Google Ads Transparency Center | ⚠️ The `SearchSuggestions` RPC worked and confirmed `wearetala.com` as an advertiser domain. `SearchCreatives` hit a **Google "sorry" captcha** on the second call. Not dependable at scale without proxies, and that's a ToS grey area. |
| TikTok ad library | ❌ No usable public endpoint found (404) |

Conclusion: **I can't reliably see a brand's ads, spend or creative counts at scale.** A magnet built on ad-library data would break or need manual work.

## 4. Reviews and social proof: fragmented

| Source | Result |
|---|---|
| Yotpo public API `api.yotpo.com/products/{key}/{product_id}/bottomline` | ✅ Works with the store key from the web pixel config. TALA: 5,061 reviews, 4.5★ store-wide. Works per product too. |
| Judge.me, Okendo, Stamped, Bazaarvoice, Reviews.io | ⚠️ Each one needs its own integration. Judge.me renders badge counts into theme HTML. I found no single generic endpoint. Survey of 8 brands: 2 Yotpo-ish, 1 Judge.me, 1 Okendo, 1 Stamped, 2 Bazaarvoice. |
| Trustpilot | ❌ **403** (bot protection) |
| Instagram profile | ❌ **429** / login wall |

## 5. History

| Source | Result |
|---|---|
| Wayback Machine CDX (old products.json, last year's Black Friday prices) | ❌ **Blocked by egress policy (env).** Normally public, but coverage of products.json is patchy. Not built on. |
| `created_at` on products | ✅ A reliable launch history for everything still published. Note that `published_at` gets reset on republish: TALA's gift card shows created 2025, published 2026-10-15. Use `created_at`. |

## 6. Other

| Source | Result |
|---|---|
| Klaviyo `fast.a.klaviyo.com/forms/api/v7/full-forms?company_id=…` | ✅ Public, 2.4 MB of signup-form config with offers ("10% off your first order"). ⚠️ It includes old and draft forms, so it can't say which offer is live. Too risky to quote. |
| Shopify App Store | ✅ Public. Confirms ASK BOSCO: $199/month, free trial, 5.0★ (14 reviews), lists "Benchmarking". |
| askbosco.io | ✅ Brand: Poppins (800 for headings), primary `#2c2c2c`, purple `#7500e3`, yellow `#ffd500`, grey `#f6f6f6`. White SVG logo. |

## So what's buildable?

Reliable, automatable, needs no login:
1. **Full catalogue with price, markdown and size-level stock** (products.json)
2. **Store basics**: currency, country, product count (meta.json)
3. **Marketing and measurement stack**: which ad, email, affiliate and analytics platforms are tagged (web pixels + GTM container)
4. **Launch cadence** (`created_at`)
5. **Review counts** for Yotpo stores only

Not dependable: ad creatives and spend, traffic, revenue, sales ranking, social followers, Trustpilot, historical prices.

**Timing:** today is Sat 17 Oct 2026. Black Friday is **Fri 27 Nov 2026 (41 days away)** and Cyber Monday is 30 Nov. Q4 stock is mostly committed by now, and BFCM ad plans are being set. Any magnet tied to BFCM gets a natural reason to reply now.
