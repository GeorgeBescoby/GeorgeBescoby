# BFCM Discount Map

How deep each of a brand's products can be discounted this Black Friday before a paid first order stops making money. Built only from public data.

```bash
pip install requests playwright
python bfcm_map.py <domain>              # e.g. aromatherapyassociates.com
python bfcm_map.py <domain> --reuse-vat  # re-render without re-reading checkout VAT
python bfcm_map.py <domain> --skip-vat   # UK VAT rules instead of checkout
```

The script:
1. Pages through `/products.json` and filters out hidden products, items under £3, gift cards, samples and spare parts.
2. Probes the standard Black Friday pages and collections, labels offers "last year" or "live", and records live markdowns.
3. Picks 10 products: the live offer product, then the Black Friday collection (newest, in stock, one per product type), then the newest in-stock products.
4. Reads "Including £X in taxes" at checkout via Playwright (`/cart/<variant>:1`, GB/GBP cookies), never types anything, and clears the cart. VAT on a marked-down price is scaled to full price.
5. Computes breaking points (40 to 70% margin), the discount ladder and the live offer cost, then writes `reports/bfcm-discount-map-<domain>.html` and `.json`.

The maths self-tests against the Grind reference numbers on every run.

Per-brand judgement goes in `brands/<domain>.json`: brand name, last-year and live offers (with evidence), postage overrides, extra sources. Auto-detection prints what it found, but read the pages yourself before pinning an offer.

Files for the current brand: `brand-selection.md`, `review.md`, `emails.md`.
