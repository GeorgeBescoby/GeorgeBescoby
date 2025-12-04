# Paid Advertising Detection Tool

A Python-based tool for analyzing company domains to detect paid advertising campaigns across multiple platforms including Google Ads, Meta/Facebook, LinkedIn, Twitter/X, TikTok, and Reddit.

## Features

- **Multi-Platform Detection**: Checks for advertising presence across 6+ major platforms
- **Multiple Detection Methods**: Uses various signals including tracking pixels, ads.txt files, and UTM parameters
- **Rate Limiting**: Built-in delays to avoid being blocked by target websites
- **Comprehensive Reporting**: CSV output with detailed notes and confidence levels
- **Summary Statistics**: Automatic generation of aggregate statistics across all analyzed domains
- **Error Handling**: Graceful handling of unreachable domains and network errors

## Supported Platforms

1. **Google Ads** - Detects via ads.txt file analysis
2. **Meta/Facebook Ads** - Detects via Facebook Pixel presence
3. **LinkedIn Ads** - Detects via LinkedIn Insight Tag
4. **Twitter/X Ads** - Detects via Twitter conversion tracking pixel
5. **TikTok Ads** - Detects via TikTok Pixel
6. **Reddit Ads** - Detects via Reddit tracking pixel
7. **General UTM Parameters** - Detects paid traffic tracking parameters

## Installation

### Prerequisites

- Python 3.7 or higher
- pip package manager

### Setup

1. Clone or download this repository

2. Install required dependencies:
```bash
pip install -r requirements.txt
```

## Usage

### Basic Usage

Run the tool with a domain list file:

```bash
python ad_detection_tool.py domains.txt
```

This will:
- Analyze all domains in `domains.txt`
- Generate a timestamped CSV output file
- Display a summary report

### Advanced Usage

**Specify custom output file:**
```bash
python ad_detection_tool.py domains.txt -o my_results.csv
```

**Adjust rate limiting (delay between requests):**
```bash
python ad_detection_tool.py domains.txt -d 3.0
```

**Enable verbose logging:**
```bash
python ad_detection_tool.py domains.txt -v
```

**Combine options:**
```bash
python ad_detection_tool.py domains.txt -o results.csv -d 1.5 -v
```

### Command Line Arguments

```
positional arguments:
  input_file            Input file containing domain names (one per line)

optional arguments:
  -h, --help            Show help message and exit
  -o OUTPUT, --output OUTPUT
                        Output CSV file (default: auto-generated with timestamp)
  -d DELAY, --delay DELAY
                        Rate limit delay in seconds (default: 2.0)
  -v, --verbose         Enable verbose logging
```

## Input Format

Create a text file (e.g., `domains.txt`) with one domain per line:

```
example.com
anothercompany.com
thirdcompany.io
subdomain.example.com
```

**Notes:**
- One domain per line
- No need to include `http://` or `https://`
- Subdomains are supported
- Lines starting with `#` are treated as comments and ignored
- Empty lines are automatically skipped

## Output Format

### CSV Output

The tool generates a CSV file with the following columns:

| Column | Description |
|--------|-------------|
| `domain` | The analyzed domain name |
| `running_ads` | Yes/No - Whether any ads were detected |
| `google_ads` | Yes/No - Google Ads detected |
| `meta_ads` | Yes/No - Meta/Facebook Ads detected |
| `linkedin_ads` | Yes/No - LinkedIn Ads detected |
| `twitter_ads` | Yes/No - Twitter/X Ads detected |
| `tiktok_ads` | Yes/No - TikTok Ads detected |
| `reddit_ads` | Yes/No - Reddit Ads detected |
| `other_platforms` | Notes about other detected platforms/signals |
| `confidence_level` | High/Medium/Low/Error - Detection confidence |
| `notes` | Detailed notes about detection signals |

### Summary Report

After analysis, a summary report is displayed showing:

```
PAID ADVERTISING DETECTION SUMMARY
============================================================

Total Domains Analyzed: 22
Domains Running Ads: 18 (81.82%)

Platform Distribution:
  Google Ads: 12 (54.5%)
  Meta Ads: 15 (68.2%)
  LinkedIn Ads: 8 (36.4%)
  Twitter Ads: 3 (13.6%)
  TikTok Ads: 2 (9.1%)
  Reddit Ads: 1 (4.5%)

Confidence Levels:
  High: 10 (45.5%)
  Medium: 6 (27.3%)
  Low: 5 (22.7%)
  Error: 1 (4.5%)
```

## Detection Methods

### Google Ads
- **Primary Method**: Checks for `ads.txt` file at domain root
- **Indicators**: Looks for Google.com, AdSense, or AdX entries in ads.txt
- **Reliability**: High - ads.txt is an IAB standard for authorized ad sellers

### Meta/Facebook Ads
- **Primary Method**: Scans website HTML for Facebook Pixel
- **Indicators**: `facebook.com/tr`, `fbq(`, `connect.facebook.net`, Facebook Pixel references
- **Reliability**: High - Facebook Pixel strongly indicates active Meta advertising

### LinkedIn Ads
- **Primary Method**: Scans website HTML for LinkedIn Insight Tag
- **Indicators**: `linkedin.com/insight`, `snap.licdn.com`, `_linkedin_partner_id`
- **Reliability**: High - Insight Tag indicates LinkedIn conversion tracking

### Twitter/X Ads
- **Primary Method**: Scans website HTML for Twitter tracking pixel
- **Indicators**: `static.ads-twitter.com`, `analytics.twitter.com`, `twq(`
- **Reliability**: Medium to High - Indicates Twitter conversion tracking

### TikTok Ads
- **Primary Method**: Scans website HTML for TikTok Pixel
- **Indicators**: `analytics.tiktok.com`, `ttq.`, TikTok Pixel references
- **Reliability**: Medium to High - TikTok Pixel indicates active campaigns

### Reddit Ads
- **Primary Method**: Scans website HTML for Reddit tracking pixel
- **Indicators**: `rdt.js`, `alb.reddit.com`, Reddit Pixel references
- **Reliability**: Medium - Less common but indicates Reddit advertising

### UTM Parameters
- **Method**: Scans website for UTM tracking parameters
- **Indicators**: `utm_source`, `utm_medium=cpc`, `utm_medium=paid`, `utm_campaign`
- **Reliability**: Medium - Indicates paid traffic tracking (general)

## Confidence Levels

The tool assigns confidence levels based on the number of positive signals detected:

- **High Confidence**: 3+ platforms detected
  - Strong evidence of active paid advertising
  - Multiple independent signals confirm ad presence

- **Medium Confidence**: 1-2 platforms detected
  - Moderate evidence of paid advertising
  - One or two platforms show clear signals

- **Low Confidence**: No platforms detected
  - No clear advertising signals found
  - Does NOT definitively mean no advertising (see Limitations)

- **Error**: Analysis encountered errors
  - Domain unreachable, timeout, or other technical issues
  - Results may be incomplete or unavailable

## Rate Limiting

To avoid being blocked or triggering rate limits:

- **Default delay**: 2 seconds between requests
- **Customizable**: Use `-d` flag to adjust (e.g., `-d 3.0` for 3 seconds)
- **Recommendation**: Use 2-3 seconds for most cases
- **Large batches**: Consider increasing to 3-5 seconds for 100+ domains

## Limitations

### Important Considerations

1. **Snapshot in Time**: Results represent advertising status at the moment of analysis. Campaigns may start or stop at any time.

2. **Detection Method Limitations**:
   - Relies on client-side tracking pixels and public files
   - Some advertisers may use server-side tracking (undetectable)
   - Privacy tools and adblockers may hide some signals

3. **Platform Coverage**:
   - Tool checks 6+ major platforms but not all advertising platforms
   - Regional platforms (Baidu, Yandex, etc.) not included
   - Programmatic/display networks may not be detected

4. **False Negatives Possible**:
   - Domain may be advertising but signals not detected
   - Campaign may be paused or just ended
   - Using different domain for advertising landing pages

5. **False Positives Possible** (Rare):
   - Tracking pixels present but campaigns inactive
   - Pixels installed for testing but never used

6. **API Access**:
   - Tool does NOT use official platform APIs (to avoid authentication requirements)
   - Official APIs would provide more accurate results but require API keys
   - Future versions may add optional API integration

### Domains That May Be Difficult to Analyze

- Domains with aggressive bot detection
- Domains requiring JavaScript for content loading
- Domains behind authentication/paywalls
- Domains that are offline or return errors

## Troubleshooting

### Common Issues

**"Connection timeout" errors:**
- Increase rate limit delay with `-d` flag
- Domain may be blocking automated requests
- Domain may be offline or slow to respond

**"No ads.txt file found" but you know they advertise:**
- Normal - not all advertisers use ads.txt
- Check other platforms (Meta, LinkedIn, etc.)
- They may advertise on platforms without detectable pixels

**All domains show "Low" confidence:**
- Domains may not be using trackable advertising methods
- Try increasing the timeout in the code
- Some domains may block automated tools

**Tool runs very slowly:**
- This is expected - rate limiting is intentional
- Reduce delay with `-d 1.0` (but may risk being blocked)
- Consider running on smaller batches

## Example Workflow

### Complete Analysis Example

1. **Prepare domain list:**
```bash
cat > my_domains.txt << EOF
example.com
competitor1.com
competitor2.com
EOF
```

2. **Run analysis:**
```bash
python ad_detection_tool.py my_domains.txt -o analysis_results.csv -v
```

3. **Review results:**
- Open `analysis_results.csv` in spreadsheet software
- Check summary statistics in terminal output
- Review detailed notes for each domain

4. **Export findings:**
- Filter CSV by `running_ads = Yes` for advertisers only
- Sort by `confidence_level` to prioritize high-confidence results
- Use `notes` column for detailed investigation

## Advanced Usage - Python API

You can also use the tool programmatically in your own Python scripts:

```python
from ad_detection_tool import AdDetectionTool

# Initialize tool
tool = AdDetectionTool(rate_limit_delay=2.0)

# Analyze a single domain
result = tool.analyze_domain('example.com')
print(result)

# Analyze multiple domains from file
results = tool.analyze_domains_from_file('domains.txt')

# Export results
tool.export_to_csv('my_results.csv')

# Get summary statistics
summary = tool.generate_summary()
print(summary)

# Print formatted summary
tool.print_summary()
```

## Future Enhancements

Potential improvements for future versions:

- [ ] Integration with official platform APIs (Meta Marketing API, Google Ads API, etc.)
- [ ] Support for additional platforms (Pinterest, Snapchat, Programmatic networks)
- [ ] Historical tracking (database storage for trend analysis)
- [ ] Competitor comparison reports
- [ ] JavaScript rendering for SPAs (using Playwright/Selenium)
- [ ] Ad creative extraction (screenshots of actual ads)
- [ ] Spending estimation based on available signals
- [ ] Email/Slack notifications for new campaigns detected
- [ ] Web dashboard for visualization
- [ ] Batch processing with parallel execution

## Contributing

Contributions are welcome! Areas for improvement:

1. Additional detection methods for existing platforms
2. Support for new advertising platforms
3. Improved confidence scoring algorithms
4. Better error handling and retry logic
5. Performance optimizations
6. Documentation improvements

## Legal & Ethical Considerations

### Acceptable Use

This tool is intended for:
- Competitive research and market analysis
- Advertising strategy planning
- Academic research
- Business intelligence

### Important Notes

- **Respect robots.txt**: Tool should honor website crawling policies
- **Rate limiting**: Always use reasonable delays to avoid overloading servers
- **Public information only**: Tool only accesses publicly available information
- **No credential theft**: Tool does NOT attempt to access authenticated content
- **No platform scraping**: Tool does NOT scrape ad platforms directly (uses public signals)

### Terms of Service

Be aware that:
- Excessive automated requests may violate website Terms of Service
- Some platforms explicitly prohibit automated access
- Always verify compliance with applicable terms before large-scale analysis

## License

This tool is provided as-is for educational and research purposes.

## Support

For issues, questions, or suggestions:
- Check the Troubleshooting section above
- Review the limitations and known issues
- Consider contributing improvements via pull request

## Changelog

### Version 1.0.0 (2025-12-04)
- Initial release
- Support for 6+ advertising platforms
- CSV export functionality
- Summary statistics generation
- Rate limiting and error handling
- Command-line interface

---

**Note**: This tool provides indicators and signals of paid advertising presence. Results should be used as guidance for further investigation rather than definitive proof. For comprehensive advertising intelligence, combine this tool with manual verification and official platform sources where available.
