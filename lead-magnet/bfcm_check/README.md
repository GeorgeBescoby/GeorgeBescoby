# Black Friday Stock & Spend Check: generator

Give it a Shopify domain and it builds an ASK BOSCO-branded, single-file HTML report (works on a phone) from public data only, plus a row of mail-merge fields for your cold email.

```bash
python3 bfcm_check.py wearetala.com
python3 bfcm_check.py allbirds.com snagtights.com lounge.com --out reports
python3 bfcm_check.py --from-file domains.txt --out reports     # one domain per line
```

You need Python 3.9+ and nothing else (standard library only). Options:

| Flag | What it does |
|---|---|
| `--out DIR` | Output folder (default `./reports`) |
| `--date YYYY-MM-DD` | Report date. Drives the "N days to Black Friday" countdown (default today). |
| `--save-raw` | Also save the fetched catalogue JSON, to audit any claim later |

## What it produces

For each domain, in `--out`:

- `{domain}.html`: the report. It's self-contained apart from the Poppins font from Google Fonts. Host it anywhere or attach it.
- `{domain}.json`: the merge fields for that brand
- `summary.csv`: one row per domain, ready for your sequencer

| Field | Use in the email |
|---|---|
| `send` | `send`, or `hold: …` with the reason. Only send rows marked `send`. |
| `store`, `days_to_bf` | "{store}, {days_to_bf} days to Black Friday" |
| `n_gaps`, `example_product`, `example_sizes_out` | **The hook.** "{n_gaps} of your products have a gap in the middle of the size run, e.g. {example_product} is out in {example_sizes_out}" |
| `n_fix`, `n_nearly_gone`, `n_sold_out`, `n_ready` | Supporting numbers |
| `n_marked_down`, `median_markdown_pct` | The discount-stacking angle |
| `n_reporting_platforms`, `reporting_platforms` | "{n} platforms will each report their own BFCM number" |
| `status`, `reason` | `ok`, or `skipped` / `error` with the reason |

Suggested first email:

> **Subject:** {store}: {days_to_bf} days to Black Friday
>
> Hi {first_name}, I ran a Black Friday stock check on {store}'s site this morning. {n_gaps} products have a gap in the middle of their size run (e.g. the {example_product} is out in {example_sizes_out}), and you've got {n_reporting_platforms} platforms tagged that will each report their own BFCM numbers.
>
> I've put it in a one-page report: the full fix list, the {n_ready} products that are ready to push, and where a sitewide code would stack on existing markdowns. Want me to send it over?

## How it works

1. `meta.json` gives the store name, currency and canonical domain.
2. `products.json` is paged 250 at a time. It backs off and retries on Shopify's 429/503 rate limiting.
3. The homepage's `webPixelsConfigList` gives the Shopify app pixels, identified by their config keys. Any `GTM-` containers on the page are then read from `googletagmanager.com/gtm.js`.
4. If the store uses Yotpo, it looks up each product's review count (used for ordering only).
5. Each product is classified:
   - **Fix first**: at least one *core* size is out while other sizes are in. Core means S/M/L for letter sizes, otherwise the middle half of the range. Wide runs need ≥25% of core sizes out. Fix-first is split into *gap in the middle of the run* (≥50% of sizes still in) and *nearly gone*. Products without sizes qualify when ≥50% of their options are out.
   - **Ready**: every size or option is in stock and there's no compare-at markdown.
   - **Sold out**: no variant is available.
   - **Marked down**: compare-at price is more than the price, and the product is still buyable.
   - Gift cards, shipping protection, message cards and other non-physical items are excluded.

A brand takes about 5–15 requests and 10–40 seconds. It's sequential with a 1-second pause between brands to be polite. Thousands of brands is an overnight batch, so run it on a schedule and let the merge file feed your sequencer.

## Missing data: what happens

| Situation | Behaviour |
|---|---|
| `products.json` is 404 (headless or locked down, e.g. huel.com) or the domain doesn't resolve | Row is `skipped` with the reason. No report is written. |
| Non-Shopify site (e.g. bulk.com) | Same as above |
| Fewer than 5 physical products | `skipped` |
| Fewer than 20 products, or fewer than 3 fix + sold-out products | Report is written, but `send = hold: …` |
| `meta.json` missing | Name comes from `og:site_name` or the domain. Prices are shown without a currency symbol. |
| Homepage blocked | The "Who's counting" section is left out and the rest of the report renders |
| No GTM, or no Yotpo | Those parts are skipped. Ordering falls back to "most core sizes out, then price", and the report says so. |
| One brand throws an unexpected error | Logged as `error` in `summary.csv`. The batch carries on. |

## Test runs (17 Oct 2026)

| Domain | Result |
|---|---|
| wearetala.com | ✅ 910 products, 101 mid-run gaps, 167 nearly gone, 472 ready, 8 platforms → `send` (the example in `../example/`) |
| snagtights.com | ✅ 853 products. Wide inclusive size runs (A–J) handled. → `send` |
| allbirds.com | ✅ 691 products, shoe sizes 5–14 handled, USD → `send` |
| lounge.com | ✅ 1,452 products → `send` |
| grind.co.uk | ✅ 14 products, coffee (no sizes) → `hold: only 14 products` |
| pipandnut.com | ✅ 6 products → `hold` |
| huel.com | ⏭️ skipped: products.json 404 (headless) |
| bulk.com | ⏭️ skipped: not Shopify |
| not-a-real-store-xyz123.com | ⏭️ skipped: doesn't resolve |

## Things to know before sending at scale

- **Snapshot, not truth.** `available` is Shopify's in-stock flag. Pre-order and "continue selling when out of stock" items show as in stock. Generate the report on the day you send it.
- **Rate limits.** Shopify returns 503/429 if you hit one store fast. The script retries, but don't run several copies against the same store at once.
- **Tags ≠ spend.** The platform list shows what's wired into the site, not where money goes. The report says this.
- **Which platforms get the ASK BOSCO outline** is set in `ASKBOSCO_CONNECTS` at the top of the rendering section. Check it matches the current integrations list.
