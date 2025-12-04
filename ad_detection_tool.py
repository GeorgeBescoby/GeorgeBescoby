#!/usr/bin/env python3
"""
Paid Advertising Detection Tool

Analyzes a list of company domains to determine:
1. Whether each company is running paid ads
2. Which specific advertising platforms they're using

Author: Claude
Date: 2025-12-04
"""

import requests
import csv
import time
import json
import re
from datetime import datetime
from urllib.parse import urlparse, quote
from typing import Dict, List, Tuple
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class AdDetectionTool:
    """Main class for detecting paid advertising across multiple platforms."""

    def __init__(self, rate_limit_delay=2.0):
        """
        Initialize the ad detection tool.

        Args:
            rate_limit_delay: Delay between requests in seconds
        """
        self.rate_limit_delay = rate_limit_delay
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        self.results = []

    def rate_limit(self):
        """Apply rate limiting between requests."""
        time.sleep(self.rate_limit_delay)

    def check_google_ads(self, domain: str) -> Tuple[bool, str]:
        """
        Check if domain is running Google Ads.

        Methods:
        1. Check for ads.txt file
        2. Look for AdSense/AdX entries

        Args:
            domain: Domain name to check

        Returns:
            Tuple of (is_running_ads, notes)
        """
        notes = []
        is_running = False

        try:
            # Check ads.txt file
            ads_txt_url = f"https://{domain}/ads.txt"
            response = self.session.get(ads_txt_url, timeout=10, allow_redirects=True)

            if response.status_code == 200:
                content = response.text.lower()

                # Look for Google AdSense/AdX entries
                if 'google.com' in content or 'adsense' in content or 'adx' in content:
                    is_running = True
                    notes.append("Google entries found in ads.txt")
                    logger.info(f"{domain}: Google Ads detected via ads.txt")
                else:
                    notes.append("ads.txt exists but no Google entries")
            else:
                notes.append("No ads.txt file found")

        except requests.exceptions.RequestException as e:
            notes.append(f"Error checking Google Ads: {str(e)[:50]}")
            logger.warning(f"{domain}: Error checking Google Ads - {e}")

        self.rate_limit()
        return is_running, "; ".join(notes)

    def check_meta_ads(self, domain: str, company_name: str = None) -> Tuple[bool, str]:
        """
        Check if domain is running Meta/Facebook Ads.

        Note: This is a simplified check. Full implementation would use
        Meta Ad Library API or web scraping of the Ad Library.

        Args:
            domain: Domain name to check
            company_name: Optional company name for searching

        Returns:
            Tuple of (is_running_ads, notes)
        """
        notes = []
        is_running = False

        try:
            # Check for Facebook Pixel on the website
            response = self.session.get(f"https://{domain}", timeout=10, allow_redirects=True)

            if response.status_code == 200:
                content = response.text.lower()

                # Look for Facebook Pixel indicators
                fb_indicators = [
                    'facebook.com/tr',
                    'fbq(',
                    'facebook pixel',
                    'connect.facebook.net',
                    '_fbp'
                ]

                fb_found = any(indicator in content for indicator in fb_indicators)

                if fb_found:
                    is_running = True
                    notes.append("Facebook Pixel detected (strong indicator of Meta ads)")
                    logger.info(f"{domain}: Meta Ads likely - Facebook Pixel found")
                else:
                    notes.append("No Facebook Pixel found")

        except requests.exceptions.RequestException as e:
            notes.append(f"Error checking Meta Ads: {str(e)[:50]}")
            logger.warning(f"{domain}: Error checking Meta Ads - {e}")

        self.rate_limit()
        return is_running, "; ".join(notes)

    def check_linkedin_ads(self, domain: str) -> Tuple[bool, str]:
        """
        Check if domain is running LinkedIn Ads.

        Args:
            domain: Domain name to check

        Returns:
            Tuple of (is_running_ads, notes)
        """
        notes = []
        is_running = False

        try:
            # Check for LinkedIn Insight Tag
            response = self.session.get(f"https://{domain}", timeout=10, allow_redirects=True)

            if response.status_code == 200:
                content = response.text.lower()

                # Look for LinkedIn Insight Tag indicators
                linkedin_indicators = [
                    'linkedin.com/insight',
                    'snap.licdn.com',
                    'linkedin insight tag',
                    '_linkedin_partner_id'
                ]

                linkedin_found = any(indicator in content for indicator in linkedin_indicators)

                if linkedin_found:
                    is_running = True
                    notes.append("LinkedIn Insight Tag detected")
                    logger.info(f"{domain}: LinkedIn Ads likely - Insight Tag found")
                else:
                    notes.append("No LinkedIn Insight Tag found")

        except requests.exceptions.RequestException as e:
            notes.append(f"Error checking LinkedIn Ads: {str(e)[:50]}")
            logger.warning(f"{domain}: Error checking LinkedIn Ads - {e}")

        self.rate_limit()
        return is_running, "; ".join(notes)

    def check_twitter_ads(self, domain: str) -> Tuple[bool, str]:
        """
        Check if domain is running Twitter/X Ads.

        Args:
            domain: Domain name to check

        Returns:
            Tuple of (is_running_ads, notes)
        """
        notes = []
        is_running = False

        try:
            # Check for Twitter conversion tracking pixel
            response = self.session.get(f"https://{domain}", timeout=10, allow_redirects=True)

            if response.status_code == 200:
                content = response.text.lower()

                # Look for Twitter pixel indicators
                twitter_indicators = [
                    'static.ads-twitter.com',
                    'analytics.twitter.com',
                    'twq(',
                    'twitter pixel'
                ]

                twitter_found = any(indicator in content for indicator in twitter_indicators)

                if twitter_found:
                    is_running = True
                    notes.append("Twitter/X pixel detected")
                    logger.info(f"{domain}: Twitter Ads likely - pixel found")
                else:
                    notes.append("No Twitter/X pixel found")

        except requests.exceptions.RequestException as e:
            notes.append(f"Error checking Twitter Ads: {str(e)[:50]}")
            logger.warning(f"{domain}: Error checking Twitter Ads - {e}")

        self.rate_limit()
        return is_running, "; ".join(notes)

    def check_tiktok_ads(self, domain: str) -> Tuple[bool, str]:
        """
        Check if domain is running TikTok Ads.

        Args:
            domain: Domain name to check

        Returns:
            Tuple of (is_running_ads, notes)
        """
        notes = []
        is_running = False

        try:
            # Check for TikTok Pixel
            response = self.session.get(f"https://{domain}", timeout=10, allow_redirects=True)

            if response.status_code == 200:
                content = response.text.lower()

                # Look for TikTok pixel indicators
                tiktok_indicators = [
                    'analytics.tiktok.com',
                    'tiktok pixel',
                    'ttq.',
                    'tiktok_pixel'
                ]

                tiktok_found = any(indicator in content for indicator in tiktok_indicators)

                if tiktok_found:
                    is_running = True
                    notes.append("TikTok Pixel detected")
                    logger.info(f"{domain}: TikTok Ads likely - pixel found")
                else:
                    notes.append("No TikTok Pixel found")

        except requests.exceptions.RequestException as e:
            notes.append(f"Error checking TikTok Ads: {str(e)[:50]}")
            logger.warning(f"{domain}: Error checking TikTok Ads - {e}")

        self.rate_limit()
        return is_running, "; ".join(notes)

    def check_reddit_ads(self, domain: str) -> Tuple[bool, str]:
        """
        Check if domain is running Reddit Ads.

        Args:
            domain: Domain name to check

        Returns:
            Tuple of (is_running_ads, notes)
        """
        notes = []
        is_running = False

        try:
            # Check for Reddit pixel
            response = self.session.get(f"https://{domain}", timeout=10, allow_redirects=True)

            if response.status_code == 200:
                content = response.text.lower()

                # Look for Reddit pixel indicators
                reddit_indicators = [
                    'rdt.js',
                    'reddit pixel',
                    'alb.reddit.com'
                ]

                reddit_found = any(indicator in content for indicator in reddit_indicators)

                if reddit_found:
                    is_running = True
                    notes.append("Reddit Pixel detected")
                    logger.info(f"{domain}: Reddit Ads likely - pixel found")
                else:
                    notes.append("No Reddit Pixel found")

        except requests.exceptions.RequestException as e:
            notes.append(f"Error checking Reddit Ads: {str(e)[:50]}")
            logger.warning(f"{domain}: Error checking Reddit Ads - {e}")

        self.rate_limit()
        return is_running, "; ".join(notes)

    def check_utm_parameters(self, domain: str) -> Tuple[bool, str]:
        """
        Check for UTM parameters indicating paid advertising.

        Args:
            domain: Domain name to check

        Returns:
            Tuple of (has_utm, notes)
        """
        notes = []
        has_utm = False

        try:
            response = self.session.get(f"https://{domain}", timeout=10, allow_redirects=True)

            if response.status_code == 200:
                content = response.text.lower()

                # Look for UTM parameter patterns
                utm_patterns = [
                    'utm_source',
                    'utm_medium=cpc',
                    'utm_medium=paid',
                    'utm_campaign'
                ]

                utm_found = any(pattern in content for pattern in utm_patterns)

                if utm_found:
                    has_utm = True
                    notes.append("UTM parameters found (paid traffic indicator)")
                else:
                    notes.append("No UTM parameters detected")

        except requests.exceptions.RequestException as e:
            notes.append(f"Error checking UTM: {str(e)[:50]}")

        return has_utm, "; ".join(notes)

    def calculate_confidence(self, platforms_detected: Dict[str, bool]) -> str:
        """
        Calculate confidence level based on number of signals detected.

        Args:
            platforms_detected: Dictionary of platform detection results

        Returns:
            Confidence level (High/Medium/Low)
        """
        positive_signals = sum(1 for v in platforms_detected.values() if v)

        if positive_signals >= 3:
            return "High"
        elif positive_signals >= 1:
            return "Medium"
        else:
            return "Low"

    def analyze_domain(self, domain: str) -> Dict:
        """
        Analyze a single domain for paid advertising across all platforms.

        Args:
            domain: Domain name to analyze

        Returns:
            Dictionary with analysis results
        """
        logger.info(f"Analyzing domain: {domain}")

        # Clean domain name
        domain = domain.strip().lower()
        if domain.startswith('http'):
            domain = urlparse(domain).netloc

        # Initialize results dictionary
        result = {
            'domain': domain,
            'running_ads': 'No',
            'google_ads': 'No',
            'meta_ads': 'No',
            'linkedin_ads': 'No',
            'twitter_ads': 'No',
            'tiktok_ads': 'No',
            'reddit_ads': 'No',
            'other_platforms': '',
            'confidence_level': 'Low',
            'notes': []
        }

        platforms_detected = {}

        # Check each platform
        try:
            # Google Ads
            google_result, google_notes = self.check_google_ads(domain)
            platforms_detected['google'] = google_result
            result['google_ads'] = 'Yes' if google_result else 'No'
            if google_notes:
                result['notes'].append(f"Google: {google_notes}")

            # Meta/Facebook Ads
            meta_result, meta_notes = self.check_meta_ads(domain)
            platforms_detected['meta'] = meta_result
            result['meta_ads'] = 'Yes' if meta_result else 'No'
            if meta_notes:
                result['notes'].append(f"Meta: {meta_notes}")

            # LinkedIn Ads
            linkedin_result, linkedin_notes = self.check_linkedin_ads(domain)
            platforms_detected['linkedin'] = linkedin_result
            result['linkedin_ads'] = 'Yes' if linkedin_result else 'No'
            if linkedin_notes:
                result['notes'].append(f"LinkedIn: {linkedin_notes}")

            # Twitter Ads
            twitter_result, twitter_notes = self.check_twitter_ads(domain)
            platforms_detected['twitter'] = twitter_result
            result['twitter_ads'] = 'Yes' if twitter_result else 'No'
            if twitter_notes:
                result['notes'].append(f"Twitter: {twitter_notes}")

            # TikTok Ads
            tiktok_result, tiktok_notes = self.check_tiktok_ads(domain)
            platforms_detected['tiktok'] = tiktok_result
            result['tiktok_ads'] = 'Yes' if tiktok_result else 'No'
            if tiktok_notes:
                result['notes'].append(f"TikTok: {tiktok_notes}")

            # Reddit Ads
            reddit_result, reddit_notes = self.check_reddit_ads(domain)
            platforms_detected['reddit'] = reddit_result
            result['reddit_ads'] = 'Yes' if reddit_result else 'No'
            if reddit_notes:
                result['notes'].append(f"Reddit: {reddit_notes}")

            # Check UTM parameters
            utm_result, utm_notes = self.check_utm_parameters(domain)
            if utm_result:
                result['other_platforms'] = 'UTM tracking detected'
                result['notes'].append(utm_notes)

            # Determine if running ads overall
            if any(platforms_detected.values()) or utm_result:
                result['running_ads'] = 'Yes'

            # Calculate confidence level
            result['confidence_level'] = self.calculate_confidence(platforms_detected)

            # Combine notes
            result['notes'] = ' | '.join(result['notes'])

            logger.info(f"{domain}: Analysis complete - Running ads: {result['running_ads']}")

        except Exception as e:
            logger.error(f"{domain}: Unexpected error during analysis - {e}")
            result['notes'] = f"Analysis error: {str(e)[:100]}"
            result['confidence_level'] = 'Error'

        return result

    def analyze_domains_from_file(self, input_file: str) -> List[Dict]:
        """
        Analyze multiple domains from an input file.

        Args:
            input_file: Path to file containing domain names (one per line)

        Returns:
            List of analysis results
        """
        logger.info(f"Reading domains from {input_file}")

        try:
            with open(input_file, 'r') as f:
                domains = [line.strip() for line in f if line.strip() and not line.startswith('#')]
        except FileNotFoundError:
            logger.error(f"Input file not found: {input_file}")
            return []

        logger.info(f"Found {len(domains)} domains to analyze")

        results = []
        for i, domain in enumerate(domains, 1):
            logger.info(f"Progress: {i}/{len(domains)}")
            result = self.analyze_domain(domain)
            results.append(result)
            self.results.append(result)

        return results

    def export_to_csv(self, output_file: str = None):
        """
        Export results to CSV file.

        Args:
            output_file: Path to output CSV file (auto-generated if None)
        """
        if not output_file:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_file = f'ad_detection_results_{timestamp}.csv'

        logger.info(f"Exporting results to {output_file}")

        fieldnames = [
            'domain', 'running_ads', 'google_ads', 'meta_ads', 'linkedin_ads',
            'twitter_ads', 'tiktok_ads', 'reddit_ads', 'other_platforms',
            'confidence_level', 'notes'
        ]

        with open(output_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(self.results)

        logger.info(f"Results exported successfully to {output_file}")
        return output_file

    def generate_summary(self) -> Dict:
        """
        Generate summary statistics from analysis results.

        Returns:
            Dictionary with summary statistics
        """
        if not self.results:
            return {}

        total_domains = len(self.results)
        running_ads = sum(1 for r in self.results if r['running_ads'] == 'Yes')

        platform_counts = {
            'Google Ads': sum(1 for r in self.results if r['google_ads'] == 'Yes'),
            'Meta Ads': sum(1 for r in self.results if r['meta_ads'] == 'Yes'),
            'LinkedIn Ads': sum(1 for r in self.results if r['linkedin_ads'] == 'Yes'),
            'Twitter Ads': sum(1 for r in self.results if r['twitter_ads'] == 'Yes'),
            'TikTok Ads': sum(1 for r in self.results if r['tiktok_ads'] == 'Yes'),
            'Reddit Ads': sum(1 for r in self.results if r['reddit_ads'] == 'Yes')
        }

        confidence_levels = {
            'High': sum(1 for r in self.results if r['confidence_level'] == 'High'),
            'Medium': sum(1 for r in self.results if r['confidence_level'] == 'Medium'),
            'Low': sum(1 for r in self.results if r['confidence_level'] == 'Low'),
            'Error': sum(1 for r in self.results if r['confidence_level'] == 'Error')
        }

        summary = {
            'total_domains': total_domains,
            'running_ads': running_ads,
            'percentage_running_ads': round((running_ads / total_domains * 100), 2) if total_domains > 0 else 0,
            'platform_distribution': platform_counts,
            'confidence_levels': confidence_levels
        }

        return summary

    def print_summary(self):
        """Print summary statistics to console."""
        summary = self.generate_summary()

        if not summary:
            logger.warning("No results to summarize")
            return

        print("\n" + "="*60)
        print("PAID ADVERTISING DETECTION SUMMARY")
        print("="*60)
        print(f"\nTotal Domains Analyzed: {summary['total_domains']}")
        print(f"Domains Running Ads: {summary['running_ads']} ({summary['percentage_running_ads']}%)")

        print("\nPlatform Distribution:")
        for platform, count in summary['platform_distribution'].items():
            percentage = round((count / summary['total_domains'] * 100), 1) if summary['total_domains'] > 0 else 0
            print(f"  {platform}: {count} ({percentage}%)")

        print("\nConfidence Levels:")
        for level, count in summary['confidence_levels'].items():
            percentage = round((count / summary['total_domains'] * 100), 1) if summary['total_domains'] > 0 else 0
            print(f"  {level}: {count} ({percentage}%)")

        print("\n" + "="*60 + "\n")


def main():
    """Main execution function."""
    import argparse

    parser = argparse.ArgumentParser(description='Paid Advertising Detection Tool')
    parser.add_argument('input_file', help='Input file containing domain names (one per line)')
    parser.add_argument('-o', '--output', help='Output CSV file (default: auto-generated with timestamp)')
    parser.add_argument('-d', '--delay', type=float, default=2.0, help='Rate limit delay in seconds (default: 2.0)')
    parser.add_argument('-v', '--verbose', action='store_true', help='Enable verbose logging')

    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

    # Initialize tool
    tool = AdDetectionTool(rate_limit_delay=args.delay)

    # Analyze domains
    logger.info("Starting analysis...")
    tool.analyze_domains_from_file(args.input_file)

    # Export results
    output_file = tool.export_to_csv(args.output)

    # Print summary
    tool.print_summary()

    logger.info(f"Analysis complete! Results saved to {output_file}")


if __name__ == '__main__':
    main()
