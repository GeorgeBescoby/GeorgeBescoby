#!/usr/bin/env python3
"""
Brand Enrichment Script
Automates brand domain enrichment and contact discovery for retail prospecting.

Usage:
    python brand_enrichment.py --domain sigmasports.com --limit 10
    python brand_enrichment.py --domain sigmasports.com --shopify-only
    python brand_enrichment.py --domain sigmasports.com --no-cognism --full
"""

import requests
from bs4 import BeautifulSoup
import pandas as pd
import argparse
import time
import json
from datetime import datetime
from urllib.parse import urlparse, urljoin
import sys
from typing import List, Dict, Optional
import re
import warnings
from urllib3.exceptions import InsecureRequestWarning

# Suppress SSL warnings
warnings.filterwarnings('ignore', category=InsecureRequestWarning)

# API Configuration
SERPER_API_KEY = "941e90a183fc41b28ca4be7a6a3954acf9eb3bcf"
COGNISM_API_KEY = "API-P-784f27db502d4c61a10b49d675151de6"

# Target job titles for Cognism
TARGET_JOB_TITLES = [
    "CMO",
    "Chief Marketing Officer",
    "Marketing Director",
    "Head of Marketing",
    "Head of Digital Marketing",
    "Digital Marketing Manager",
    "Ecommerce Director",
    "Head of Ecommerce",
    "Performance Marketing Manager",
    "Growth Marketing Manager"
]

# Request configuration
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}
REQUEST_TIMEOUT = 10
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds


def retry_request(func, *args, max_retries=MAX_RETRIES, **kwargs):
    """
    Retry a function with exponential backoff.
    """
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait_time = RETRY_DELAY * (2 ** attempt)
            print(f"  ⚠ Attempt {attempt + 1} failed: {str(e)[:50]}... Retrying in {wait_time}s")
            time.sleep(wait_time)
    return None


def scrape_brands(domain: str) -> List[str]:
    """
    Stage 1: Scrape brand names from a company's website.

    Args:
        domain: Company domain to scrape (e.g., "sigmasports.com")

    Returns:
        List of unique brand names
    """
    print(f"\n🔍 STAGE 1: Scraping brands from {domain}")
    print("=" * 60)

    brands = set()

    # Normalize domain
    if not domain.startswith('http'):
        # Try with www. first
        domain = f'https://www.{domain}' if not domain.startswith('www.') else f'https://{domain}'

    try:
        # Try to fetch the main page
        response = requests.get(domain, headers=HEADERS, timeout=REQUEST_TIMEOUT, verify=False, allow_redirects=True)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        # Strategy: Look for links with /brand/ in href - these are actual brand pages
        # This is a much more reliable method than scraping random text

        print(f"  🔎 Analyzing navigation and brand links...")

        # Method 1: Find all links with /brand/ in the URL
        for link in soup.find_all('a', href=True):
            href = link.get('href', '')

            # Check if this is a brand link
            if '/brand/' in href:
                # Get the brand name from the link text
                text = link.get_text(strip=True)

                # Clean up the text - remove "NEW" prefix and other noise
                text = re.sub(r'^NEW\s+', '', text, flags=re.IGNORECASE)
                text = re.sub(r'\s+', ' ', text).strip()

                # Filter out navigation items and ensure it looks like a brand
                if (text and
                    len(text) > 1 and
                    len(text) < 40 and
                    not text.isdigit() and
                    not any(skip in text.lower() for skip in [
                        'shop all', 'view all', 'all brands', 'top brands',
                        'featured', 'new arrivals', 'sale', 'clearance'
                    ])):
                    brands.add(text)

        # Method 2: Look for structured brand navigation
        # Find elements that likely contain brand lists (like dropdowns, navigation menus)
        for nav_section in soup.find_all(['ul', 'div'], class_=re.compile(r'(brand|navigation)', re.I)):
            for link in nav_section.find_all('a', href=True):
                href = link.get('href', '')
                text = link.get_text(strip=True)

                # Extract brand from URLs like /bikes/specialized, /clothing/castelli, etc.
                if any(cat in href for cat in ['/bikes/', '/clothing/', '/components/', '/wheels/']):
                    # Extract the last segment as potential brand
                    parts = href.strip('/').split('/')
                    if len(parts) > 1:
                        potential_brand = parts[-1].replace('-', ' ').title()
                        # Only add if it looks reasonable
                        if (len(potential_brand) > 2 and
                            len(potential_brand) < 40 and
                            not potential_brand.lower() in ['all', 'sale', 'new', 'clearance']):
                            brands.add(potential_brand)

                # Also add text if it matches brand pattern
                text = re.sub(r'^NEW\s+', '', text, flags=re.IGNORECASE)
                text = re.sub(r'\s+', ' ', text).strip()

                if (text and
                    len(text) > 1 and
                    len(text) < 40 and
                    not text.isdigit() and
                    not any(skip in text.lower() for skip in [
                        'shop all', 'view all', 'all', 'top brands',
                        'featured', 'new', 'sale', 'clearance', 'bikes',
                        'clothing', 'components', 'accessories', 'wheels'
                    ])):
                    brands.add(text)

        # If we didn't find many brands, try meta tags and structured data
        if len(brands) < 5:
            # Look for schema.org data
            for script in soup.find_all('script', type='application/ld+json'):
                try:
                    data = json.loads(script.string)
                    if isinstance(data, dict) and 'brand' in data:
                        brand_name = data['brand'].get('name', '') if isinstance(data['brand'], dict) else data['brand']
                        if brand_name:
                            brands.add(brand_name)
                except:
                    pass

    except Exception as e:
        print(f"  ❌ Error scraping {domain}: {e}")
        return []

    # Clean and filter brands
    cleaned_brands = []

    # Common category keywords to exclude (not actual brands)
    category_keywords = [
        'lights', 'shoes', 'socks', 'gloves', 'mitts', 'jackets', 'shorts',
        'bikes', 'frames', 'framesets', 'pedals', 'rotors', 'spokes', 'forks',
        'headwear', 'groupsets', 'overshoes', 'podcast', 'sizing', 'discount',
        'programme', 'program', 'top 5', 'top 10', 'ahead of', 'hydration systems',
        'energy drinks', 'energy chews'
    ]

    for brand in brands:
        # Remove common noise
        brand = brand.strip()
        brand_lower = brand.lower()

        # Check if this is likely a category rather than a brand
        is_category = any(keyword in brand_lower for keyword in category_keywords)

        if (brand and
            len(brand) > 2 and
            not brand.isdigit() and
            not brand.startswith('http') and
            not is_category):
            cleaned_brands.append(brand)

    # Remove duplicates (case-insensitive)
    unique_brands = []
    seen = set()
    for brand in cleaned_brands:
        brand_lower = brand.lower()
        if brand_lower not in seen:
            seen.add(brand_lower)
            unique_brands.append(brand)

    print(f"\n✅ Scraped {len(unique_brands)} unique brands from {urlparse(domain).netloc}")

    return unique_brands


def find_domain_serper(brand_name: str, api_key: str) -> str:
    """
    Stage 2: Find official domain for a brand using Serper.dev API.

    Args:
        brand_name: Name of the brand to search
        api_key: Serper API key

    Returns:
        Domain string or error flag
    """
    query = f"{brand_name} official website"

    headers = {
        "X-API-KEY": api_key,
        "Content-Type": "application/json"
    }

    body = {
        "q": query,
        "num": 5
    }

    try:
        response = retry_request(
            requests.post,
            "https://google.serper.dev/search",
            headers=headers,
            json=body,
            timeout=REQUEST_TIMEOUT
        )

        if not response or response.status_code != 200:
            return "SEARCH_FAILED"

        data = response.json()

        if 'organic' not in data or not data['organic']:
            return "DOMAIN_NOT_FOUND"

        # Common retailer domains to skip
        retailer_domains = ['amazon', 'ebay', 'walmart', 'target', 'alibaba', 'aliexpress',
                           'facebook', 'instagram', 'twitter', 'linkedin', 'wikipedia']

        # Check top results
        for result in data['organic'][:5]:
            link = result.get('link', '')
            if not link:
                continue

            # Extract domain
            domain = urlparse(link).netloc.lower()
            domain = domain.replace('www.', '')

            # Validate: domain should relate to brand name and not be a retailer
            brand_words = set(brand_name.lower().split())
            domain_words = set(re.split(r'[.\-_]', domain))

            # Skip retailer domains
            if any(retailer in domain for retailer in retailer_domains):
                continue

            # Check if brand name is in domain or vice versa
            if (any(word in domain for word in brand_words if len(word) > 3) or
                any(word in brand_name.lower() for word in domain_words if len(word) > 3)):
                return domain

        return "DOMAIN_NOT_FOUND"

    except Exception as e:
        print(f"  ⚠ Serper error for {brand_name}: {str(e)[:50]}")
        return "SEARCH_FAILED"


def check_shopify(domain: str) -> str:
    """
    Stage 3: Check if a domain uses Shopify using multi-signal approach.

    Args:
        domain: Domain to check

    Returns:
        "YES", "NO", "UNKNOWN", "BLOCKED", or "TIMEOUT"
    """
    if not domain or domain in ["DOMAIN_NOT_FOUND", "SEARCH_FAILED"]:
        return "UNKNOWN"

    # Normalize domain
    if not domain.startswith('http'):
        domain = f'https://{domain}'

    signals_detected = 0

    try:
        # Signal 1: Check main page HTML for CDN
        try:
            response = requests.get(domain, headers=HEADERS, timeout=REQUEST_TIMEOUT, verify=False, allow_redirects=True)
            if response.status_code == 403 or response.status_code == 429:
                return "BLOCKED"

            response.raise_for_status()
            html = response.text

            # Check for Shopify CDN
            if 'cdn.shopify.com' in html:
                signals_detected += 1

            # Check for Shopify in meta tags
            soup = BeautifulSoup(html, 'html.parser')
            for meta in soup.find_all('meta'):
                content = str(meta.get('content', '')).lower()
                if 'shopify' in content:
                    signals_detected += 1
                    break

            # Check headers
            headers = response.headers
            if 'X-ShopId' in headers or 'X-Shopify-Stage' in headers:
                signals_detected += 1

        except requests.Timeout:
            return "TIMEOUT"
        except:
            pass

        # Signal 2: Check cart.js endpoint
        try:
            cart_response = requests.get(
                f"{domain}/cart.js",
                headers=HEADERS,
                timeout=REQUEST_TIMEOUT,
                verify=False,
                allow_redirects=True
            )
            if cart_response.status_code == 200:
                try:
                    cart_response.json()
                    signals_detected += 1
                except:
                    pass
        except:
            pass

        # Signal 3: Check products.json endpoint
        try:
            products_response = requests.get(
                f"{domain}/products.json",
                headers=HEADERS,
                timeout=REQUEST_TIMEOUT,
                verify=False,
                allow_redirects=True
            )
            if products_response.status_code == 200:
                try:
                    products_response.json()
                    signals_detected += 1
                except:
                    pass
        except:
            pass

        # Decision: 2+ signals = YES
        if signals_detected >= 2:
            return "YES"
        elif signals_detected > 0:
            return "NO"  # Some signals but not enough
        else:
            return "NO"

    except requests.Timeout:
        return "TIMEOUT"
    except Exception as e:
        return "UNKNOWN"


def get_cognism_contacts(domain: str, job_titles: List[str], api_key: str) -> List[Dict]:
    """
    Stage 4: Get decision-maker contacts from Cognism API.

    Args:
        domain: Company domain
        job_titles: List of target job titles
        api_key: Cognism API key

    Returns:
        List of contact dictionaries
    """
    if not domain or domain in ["DOMAIN_NOT_FOUND", "SEARCH_FAILED"]:
        return []

    # Remove protocol for Cognism
    clean_domain = domain.replace('https://', '').replace('http://', '').split('/')[0]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    body = {
        "accountDomain": [clean_domain],
        "jobTitle": job_titles,
        "pageSize": 20
    }

    try:
        response = retry_request(
            requests.post,
            "https://app.cognism.com/api/search/contact",
            headers=headers,
            json=body,
            timeout=REQUEST_TIMEOUT
        )

        if not response or response.status_code != 200:
            return []

        data = response.json()

        if 'contacts' not in data or not data['contacts']:
            return []

        contacts = []
        for contact in data['contacts']:
            contact_info = {
                'name': contact.get('fullName', ''),
                'title': contact.get('jobTitle', ''),
                'email': contact.get('email', {}).get('address', ''),
                'mobile': contact.get('mobilePhoneNumbers', [{}])[0].get('number', '') if contact.get('mobilePhoneNumbers') else '',
                'direct_phone': contact.get('directPhoneNumbers', [{}])[0].get('number', '') if contact.get('directPhoneNumbers') else ''
            }
            contacts.append(contact_info)

        return contacts

    except Exception as e:
        print(f"  ⚠ Cognism error for {domain}: {str(e)[:50]}")
        return []


def create_csv(results: List[Dict], filename: str) -> None:
    """
    Stage 5: Create CSV file from results.

    Args:
        results: List of enrichment results
        filename: Output filename
    """
    print(f"\n📊 STAGE 5: Creating CSV output")
    print("=" * 60)

    df = pd.DataFrame(results)
    df.to_csv(filename, index=False)

    print(f"✅ CSV saved: {filename}")


def main():
    """
    Main execution function.
    """
    parser = argparse.ArgumentParser(
        description='Brand Enrichment Script - Automate brand domain enrichment and contact discovery'
    )
    parser.add_argument('--domain', required=True, help='Company domain to scrape (e.g., sigmasports.com)')
    parser.add_argument('--limit', type=int, default=10, help='Only process first N brands (default: 10)')
    parser.add_argument('--shopify-only', action='store_true', help='Only enrich brands that use Shopify')
    parser.add_argument('--no-cognism', action='store_true', help='Skip contact enrichment')
    parser.add_argument('--full', action='store_true', help='Process all brands (removes limit)')

    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("🚀 BRAND ENRICHMENT SCRIPT")
    print("=" * 60)

    # Stage 1: Scrape brands
    brands = scrape_brands(args.domain)

    if not brands:
        print("\n❌ No brands found. Exiting.")
        sys.exit(1)

    # Apply limit
    if not args.full:
        original_count = len(brands)
        brands = brands[:args.limit]
        if original_count > len(brands):
            print(f"\n⚠ Limiting to first {len(brands)} brands (use --full to process all {original_count})")

    # Confirmation for large batches
    if len(brands) > 50 and not args.full:
        print(f"\n⚠ Warning: Processing {len(brands)} brands. This may take a while.")
        confirm = input("Continue? (y/n): ")
        if confirm.lower() != 'y':
            print("Cancelled.")
            sys.exit(0)

    # Stage 2: Find domains
    print(f"\n🌐 STAGE 2: Finding domains using Serper API")
    print("=" * 60)

    brand_domains = {}
    for i, brand in enumerate(brands, 1):
        print(f"  [{i}/{len(brands)}] {brand}...", end=' ')
        domain = find_domain_serper(brand, SERPER_API_KEY)
        brand_domains[brand] = domain
        print(f"{domain}")
        time.sleep(0.5)  # Rate limiting

    domains_found = sum(1 for d in brand_domains.values() if d not in ["DOMAIN_NOT_FOUND", "SEARCH_FAILED"])
    print(f"\n✅ Domains found: {domains_found}/{len(brands)} ({domains_found/len(brands)*100:.1f}%)")

    # Stage 3: Check Shopify
    print(f"\n🛒 STAGE 3: Checking Shopify usage")
    print("=" * 60)

    shopify_status = {}
    for i, (brand, domain) in enumerate(brand_domains.items(), 1):
        print(f"  [{i}/{len(brand_domains)}] {brand}...", end=' ')
        status = check_shopify(domain)
        shopify_status[brand] = status
        print(f"{status}")
        time.sleep(0.3)  # Be polite

    shopify_count = sum(1 for s in shopify_status.values() if s == "YES")
    print(f"\n✅ Shopify brands: {shopify_count}/{len(brands)} ({shopify_count/len(brands)*100:.1f}%)")

    # Filter for Shopify-only if requested
    if args.shopify_only:
        brands_to_enrich = [b for b in brands if shopify_status[b] == "YES"]
        print(f"\n🔍 Filtering to Shopify brands only: {len(brands_to_enrich)} brands")
    else:
        brands_to_enrich = brands

    # Stage 4: Get contacts
    all_contacts = {}
    if not args.no_cognism:
        print(f"\n👥 STAGE 4: Enriching with Cognism contacts")
        print("=" * 60)

        for i, brand in enumerate(brands_to_enrich, 1):
            domain = brand_domains[brand]
            print(f"  [{i}/{len(brands_to_enrich)}] {brand}...", end=' ')
            contacts = get_cognism_contacts(domain, TARGET_JOB_TITLES, COGNISM_API_KEY)
            all_contacts[brand] = contacts
            print(f"{len(contacts)} contacts")
            time.sleep(0.5)  # Rate limiting

        total_contacts = sum(len(c) for c in all_contacts.values())
        brands_with_contacts = sum(1 for c in all_contacts.values() if c)
        print(f"\n✅ Total contacts: {total_contacts}")
        print(f"✅ Brands with contacts: {brands_with_contacts}/{len(brands_to_enrich)} ({brands_with_contacts/len(brands_to_enrich)*100:.1f}%)")
    else:
        print(f"\n⏭ STAGE 4: Skipping Cognism enrichment (--no-cognism flag)")

    # Prepare results
    results = []
    timestamp = datetime.now().strftime("%Y-%m-%d")

    for brand in brands:
        domain = brand_domains[brand]
        shopify = shopify_status[brand]

        if args.no_cognism or brand not in all_contacts or not all_contacts[brand]:
            # No contacts
            results.append({
                'Brand Name': brand,
                'Brand Domain': domain,
                'Uses Shopify': shopify,
                'Contact Name': 'NO CONTACTS FOUND' if not args.no_cognism else 'SKIPPED',
                'Contact Job Title': '',
                'Contact Email': '',
                'Contact Mobile Phone': '',
                'Contact Direct Phone': '',
                'Date Scraped': timestamp,
                'Source Company': args.domain
            })
        else:
            # Create row for each contact
            for contact in all_contacts[brand]:
                results.append({
                    'Brand Name': brand,
                    'Brand Domain': domain,
                    'Uses Shopify': shopify,
                    'Contact Name': contact['name'],
                    'Contact Job Title': contact['title'],
                    'Contact Email': contact['email'],
                    'Contact Mobile Phone': contact['mobile'],
                    'Contact Direct Phone': contact['direct_phone'],
                    'Date Scraped': timestamp,
                    'Source Company': args.domain
                })

    # Create CSV
    clean_domain = args.domain.replace('https://', '').replace('http://', '').replace('/', '_')
    timestamp_file = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{clean_domain}_enrichment_{timestamp_file}.csv"

    create_csv(results, filename)

    # Summary
    print("\n" + "=" * 60)
    print("📈 SUMMARY")
    print("=" * 60)
    print(f"Total brands scraped: {len(brands)}")
    print(f"Domains found: {domains_found}/{len(brands)} ({domains_found/len(brands)*100:.1f}%)")
    print(f"Domains not found: {len(brands) - domains_found}/{len(brands)} ({(len(brands) - domains_found)/len(brands)*100:.1f}%)")
    print(f"Shopify brands: {shopify_count}/{len(brands)} ({shopify_count/len(brands)*100:.1f}%)")

    if not args.no_cognism:
        total_contacts = sum(len(c) for c in all_contacts.values())
        brands_with_contacts = sum(1 for c in all_contacts.values() if c)
        print(f"Total contacts retrieved: {total_contacts}")
        print(f"Brands with contacts: {brands_with_contacts}/{len(brands_to_enrich)} ({brands_with_contacts/len(brands_to_enrich)*100:.1f}%)")

    print(f"\n✅ Output file: {filename}")
    print("=" * 60)


if __name__ == "__main__":
    main()
