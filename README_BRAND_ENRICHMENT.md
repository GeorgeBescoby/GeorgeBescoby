# Brand Enrichment Script

**Automate brand domain enrichment and contact discovery for retail prospecting**

## Overview

`brand_enrichment.py` is a Python automation tool that scrapes brand names from retail websites, finds their official domains, checks if they use Shopify, and enriches them with decision-maker contact information from Cognism.

## Features

- **Automated Brand Scraping**: Extracts brand names from any retail website
- **Domain Discovery**: Uses Serper.dev API to find official brand domains
- **Shopify Detection**: Multi-signal approach to detect Shopify stores
- **Contact Enrichment**: Gets decision-maker contacts from Cognism API
- **CSV Export**: Outputs all data to a timestamped CSV file
- **Safety Features**: Rate limiting, retry logic, progress indicators

## Workflow

```
1. Scrape Brands → 2. Find Domains → 3. Check Shopify → 4. Get Contacts → 5. Export CSV
```

### Stage 1: Brand Scraping
- Analyzes website navigation and brand links
- Extracts brand names from `/brand/` URLs
- Filters out categories and non-brand content
- Returns unique, cleaned brand list

### Stage 2: Domain Finding (Serper.dev)
- Searches for "{brand} official website"
- Validates results (excludes retailers like Amazon, eBay)
- Returns brand's official domain
- Retries 3x on failures

### Stage 3: Shopify Detection
- **Multi-signal approach** (requires 2+ signals):
  1. CDN check: `cdn.shopify.com` in HTML
  2. Cart.js endpoint: `/cart.js` returns JSON
  3. Products.json endpoint: `/products.json` returns JSON
  4. Meta tags: Shopify in metadata
  5. Headers: `X-ShopId` or `X-Shopify-Stage`
- Returns: YES, NO, UNKNOWN, BLOCKED, or TIMEOUT

### Stage 4: Cognism Contact Enrichment
- Searches for decision-makers by job title:
  - CMO / Chief Marketing Officer
  - Marketing Director
  - Head of Marketing / Digital Marketing
  - Ecommerce Director / Head of Ecommerce
  - Performance / Growth Marketing Manager
- Extracts: Name, Title, Email, Mobile, Direct Phone
- Creates separate CSV row for each contact

### Stage 5: CSV Export
- Columns: Brand Name, Domain, Uses Shopify, Contact details, Date, Source
- Filename: `{domain}_enrichment_{timestamp}.csv`
- Saved to current directory

## Installation

```bash
# Install dependencies
pip install requests beautifulsoup4 pandas

# Make script executable (optional)
chmod +x brand_enrichment.py
```

## Usage

### Basic Usage

```bash
# Process 10 brands (default limit)
python brand_enrichment.py --domain sigmasports.com

# Process 50 brands
python brand_enrichment.py --domain sigmasports.com --limit 50
```

### Advanced Usage

```bash
# Only enrich Shopify brands
python brand_enrichment.py --domain sigmasports.com --shopify-only --limit 20

# Skip contact enrichment (domains + Shopify only)
python brand_enrichment.py --domain sigmasports.com --no-cognism

# Process all brands (removes limit)
python brand_enrichment.py --domain sigmasports.com --full
```

## Command-Line Arguments

| Argument | Type | Description | Default |
|----------|------|-------------|---------|
| `--domain` | Required | Company domain to scrape | - |
| `--limit` | Optional | Process first N brands | 10 |
| `--shopify-only` | Flag | Only enrich Shopify brands | False |
| `--no-cognism` | Flag | Skip contact enrichment | False |
| `--full` | Flag | Process all brands | False |

## API Configuration

### Serper.dev (Google Search API)
- **Endpoint**: `https://google.serper.dev/search`
- **Cost**: ~$0.01 per search
- **Rate Limit**: 0.5s delay between calls
- **Key Location**: Line 30 in script

### Cognism (Contact Database)
- **Endpoint**: `https://app.cognism.com/api/search/contact`
- **Cost**: Per credit (varies by plan)
- **Rate Limit**: 0.5s delay between calls
- **Key Location**: Line 31 in script

> **Security Note**: For production use, move API keys to environment variables

## Output Format

### CSV Columns

| Column | Description | Example |
|--------|-------------|---------|
| Brand Name | Scraped brand name | "Specialized" |
| Brand Domain | Official domain | "specialized.com" |
| Uses Shopify | Shopify detection result | "YES", "NO", "UNKNOWN" |
| Contact Name | Full name | "John Smith" |
| Contact Job Title | Position | "Head of Marketing" |
| Contact Email | Email address | "john@specialized.com" |
| Contact Mobile Phone | Mobile number | "+44 7700 900000" |
| Contact Direct Phone | Direct line | "+44 20 1234 5678" |
| Date Scraped | Processing date | "2026-01-06" |
| Source Company | Original domain | "sigmasports.com" |

### Special Values

| Value | Meaning |
|-------|---------|
| `DOMAIN_NOT_FOUND` | Could not find brand domain |
| `SEARCH_FAILED` | Serper API error |
| `NO CONTACTS FOUND` | No Cognism results |
| `COGNISM_ERROR` | Cognism API error |
| `BLOCKED` | Domain blocked access (403/429) |
| `TIMEOUT` | Domain didn't respond |

## Example Output

```
============================================================
📈 SUMMARY
============================================================
Total brands scraped: 306
Domains found: 10/15 (66.7%)
Domains not found: 5/15 (33.3%)
Shopify brands: 2/15 (13.3%)
Total contacts retrieved: 0
Brands with contacts: 0/15 (0.0%)

✅ Output file: sigmasports.com_enrichment_20260106_195540.csv
============================================================
```

## Safety Features

### Rate Limiting
- 0.5s delay between Serper calls
- 0.5s delay between Cognism calls
- 0.3s delay between Shopify checks

### Retry Logic
- 3 retries with exponential backoff (2s, 4s, 8s)
- Continues on individual failures
- Flags errors in CSV output

### Default Limits
- Default: 10 brands (prevents accidental large runs)
- Confirmation prompt for 50+ brands
- Use `--full` to process all

### Error Handling
- SSL verification disabled for problematic sites
- Timeouts: 10 seconds per request
- Graceful degradation (continues on errors)

## Test Results (sigmasports.com)

```bash
python brand_enrichment.py --domain sigmasports.com --limit 15
```

**Results:**
- ✅ Scraped 306 unique brands
- ✅ Found 10/15 domains (66.7%)
- ✅ Detected 2 Shopify stores (Parcours, Bento Boxes)
- ✅ Generated CSV with all results

**Brands Found:** Parcours, Brooks, Colnago, SRAM, Van Rysel, On Running, etc.

## Limitations

### Brand Scraping
- Accuracy depends on website structure
- Some categories may be misidentified as brands
- Works best with sites that have `/brand/` URLs

### Cognism Contacts
- Results depend on database coverage
- Domain matching must be exact
- Not all companies have target job titles

### Shopify Detection
- May miss custom Shopify implementations
- Some sites block automated checks (403/429)
- Multi-signal approach reduces false positives

## Troubleshooting

### No Brands Found
- Check domain is accessible
- Try adding `www.` prefix
- Verify site has brand listings

### No Domains Found
- Increase limit to get better sample
- Check Serper API key is valid
- Brand names may be too generic

### No Contacts Found
- Normal for smaller brands
- Cognism may not have data
- Try different domains or brands

### SSL Errors
- Script automatically handles SSL issues
- Uses `verify=False` for compatibility
- Check firewall/proxy settings

## Code Structure

```python
scrape_brands(domain)              # Stage 1: Extract brands
find_domain_serper(brand, api_key) # Stage 2: Find domains
check_shopify(domain)              # Stage 3: Detect Shopify
get_cognism_contacts(...)          # Stage 4: Get contacts
create_csv(results, filename)      # Stage 5: Export data
main()                             # Orchestrate workflow
```

## Performance

- **10 brands**: ~2-3 minutes
- **30 brands**: ~5-7 minutes
- **100 brands**: ~15-20 minutes

Rate limits and API response times affect duration.

## Future Enhancements

- [ ] Multi-threading for faster processing
- [ ] Additional ecommerce platform detection (WooCommerce, Magento)
- [ ] Email validation and verification
- [ ] Webhook integration for real-time processing
- [ ] Database storage option
- [ ] Web UI interface

## License

Proprietary - For authorized use only

## Support

For issues or questions, contact the development team.

---

**Version**: 1.0
**Last Updated**: 2026-01-06
**Tested On**: Python 3.8+
