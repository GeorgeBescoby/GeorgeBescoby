# Brand Enrichment Script - Usage Examples

## Quick Start Examples

### Example 1: Basic Brand Discovery
```bash
python brand_enrichment.py --domain sigmasports.com --limit 10
```

**What it does:**
- Scrapes first 10 brands from Sigma Sports
- Finds their official domains
- Checks if they use Shopify
- Gets decision-maker contacts
- Exports to CSV

**Expected output:**
```
Total brands scraped: 10
Domains found: 7/10 (70.0%)
Shopify brands: 2/10 (20.0%)
Total contacts retrieved: 5
```

---

### Example 2: Shopify-Only Prospecting
```bash
python brand_enrichment.py --domain sigmasports.com --shopify-only --limit 30
```

**What it does:**
- Scrapes 30 brands
- Filters to only Shopify stores
- Enriches only the Shopify brands with contacts
- Saves CSV with Shopify brands only

**Use case:** You only want to prospect to brands using Shopify for a platform migration offer

---

### Example 3: Domain Research Only
```bash
python brand_enrichment.py --domain sigmasports.com --no-cognism --limit 50
```

**What it does:**
- Scrapes 50 brands
- Finds domains
- Checks Shopify status
- Skips contact enrichment
- Faster execution, lower API costs

**Use case:** Building a brand database before deciding which to contact

---

### Example 4: Full Brand Enrichment
```bash
python brand_enrichment.py --domain sigmasports.com --full
```

**What it does:**
- Processes ALL brands found (could be 300+)
- Complete enrichment pipeline
- May take 30-60 minutes
- Higher API costs

**Use case:** Comprehensive market research for a category

**⚠️ Warning:** This will process all brands and consume significant API credits. Use with caution.

---

## Real-World Scenarios

### Scenario 1: Competitor Analysis
**Goal:** Analyze which brands a competitor carries and which use Shopify

```bash
python brand_enrichment.py --domain competitor.com --limit 100 --no-cognism
```

**Output:** CSV with 100 brands, their domains, and Shopify status

---

### Scenario 2: Outbound Sales Campaign
**Goal:** Build a list of marketing decision-makers at Shopify brands

```bash
python brand_enrichment.py --domain retailer.com --shopify-only --limit 50
```

**Output:** CSV with Shopify brands and their CMO/Marketing Director contacts

---

### Scenario 3: Market Research
**Goal:** Understand the ecommerce platform landscape for a category

```bash
python brand_enrichment.py --domain categoryretailer.com --full
```

**Output:** Complete dataset showing what % of brands use Shopify

---

### Scenario 4: Quick Brand Validation
**Goal:** Test if specific brands use Shopify

```bash
python brand_enrichment.py --domain retailer.com --limit 20
```

**Output:** Quick validation of 20 brands' ecommerce platforms

---

## Command Combinations

### Conservative Approach (Low Cost)
```bash
python brand_enrichment.py --domain example.com --limit 10
```
- Good for: Testing, low API usage
- Time: 2-3 minutes
- Cost: $0.10 in API calls

### Balanced Approach (Medium Cost)
```bash
python brand_enrichment.py --domain example.com --limit 30 --shopify-only
```
- Good for: Targeted prospecting
- Time: 5-7 minutes
- Cost: $0.30 in API calls

### Aggressive Approach (High Cost)
```bash
python brand_enrichment.py --domain example.com --full
```
- Good for: Comprehensive research
- Time: 30-60 minutes
- Cost: $3-5 in API calls

---

## Output Examples

### CSV Output Sample

| Brand Name | Brand Domain | Uses Shopify | Contact Name | Contact Job Title | Contact Email |
|------------|-------------|--------------|--------------|-------------------|---------------|
| Parcours | parcours.cc | YES | John Smith | Head of Marketing | john@parcours.cc |
| Colnago | colnago.com | NO | NO CONTACTS FOUND | | |
| SRAM | sram.com | NO | Sarah Jones | CMO | sarah@sram.com |

### Console Output Example

```
============================================================
🚀 BRAND ENRICHMENT SCRIPT
============================================================

🔍 STAGE 1: Scraping brands from sigmasports.com
============================================================
  🔎 Analyzing navigation and brand links...

✅ Scraped 306 unique brands from www.sigmasports.com

⚠ Limiting to first 15 brands (use --full to process all 306)

🌐 STAGE 2: Finding domains using Serper API
============================================================
  [1/15] Parcours... parcours.cc
  [2/15] Brooks... brooksrunning.com
  [3/15] Colnago... colnago.com
  ...

✅ Domains found: 10/15 (66.7%)

🛒 STAGE 3: Checking Shopify usage
============================================================
  [1/15] Parcours... YES
  [2/15] Brooks... BLOCKED
  [3/15] Colnago... NO
  ...

✅ Shopify brands: 2/15 (13.3%)

👥 STAGE 4: Enriching with Cognism contacts
============================================================
  [1/15] Parcours... 3 contacts
  [2/15] Brooks... 5 contacts
  ...

✅ Total contacts: 15

📊 STAGE 5: Creating CSV output
============================================================
✅ CSV saved: sigmasports.com_enrichment_20260106_195540.csv

============================================================
📈 SUMMARY
============================================================
Total brands scraped: 15
Domains found: 10/15 (66.7%)
Domains not found: 5/15 (33.3%)
Shopify brands: 2/15 (13.3%)
Total contacts retrieved: 15
Brands with contacts: 8/15 (53.3%)

✅ Output file: sigmasports.com_enrichment_20260106_195540.csv
============================================================
```

---

## Pro Tips

### 1. Start Small
Always start with `--limit 10` to test the website structure before running full enrichment.

### 2. Use Shopify Filter
If you only care about Shopify brands, use `--shopify-only` to reduce Cognism API costs.

### 3. Skip Cognism for Research
Use `--no-cognism` when building initial brand lists to save API credits.

### 4. Check Output Quality
Review the first CSV output to ensure brands are being scraped correctly before scaling up.

### 5. Monitor API Usage
- Serper: ~$0.01 per brand
- Cognism: Varies by plan (can be $1+ per contact)

### 6. Handle Different Retailers
Different retail sites have different structures. Test with `--limit 10` first.

---

## Troubleshooting Common Issues

### Issue: Only finding 5-10 brands
**Solution:** Some sites hide brands in dropdowns. Increase limit to get more diverse results.

### Issue: Many "DOMAIN_NOT_FOUND"
**Solution:** Brand names may be too generic. This is normal for some categories.

### Issue: No Cognism contacts
**Solution:** Common for smaller brands. Try larger, well-known brands for testing.

### Issue: Script timing out
**Solution:** Reduce limit, check internet connection, verify API keys.

---

## Integration Ideas

### CRM Import
Export CSV and import into Salesforce, HubSpot, or other CRM systems.

### Google Sheets
Upload CSV to Google Sheets for team collaboration.

### Email Campaign
Use contact data with tools like Mailchimp or Lemlist for outreach.

### Data Analysis
Import into Python/pandas or Excel for further analysis.

---

## Next Steps After Running

1. **Review CSV Output**: Check data quality and brand relevance
2. **Filter Results**: Remove irrelevant brands or contacts
3. **Verify Contacts**: Double-check email addresses before outreach
4. **Segment Brands**: Group by Shopify status, size, category
5. **Plan Outreach**: Create personalized messaging based on data

---

**Happy Prospecting!** 🚀
