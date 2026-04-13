#!/usr/bin/env python3
"""
CSV Upload Script
Reads a CSV file containing contacts and/or companies, validates the data,
and outputs a structured JSON file ready for enrichment.

Usage:
    python upload_csv.py <path_to_csv> [--output <output_file.json>]

CSV Format:
    Required columns: type, name (contacts), company_name or company_domain
    See sample_upload_template.csv for a full example.

    type          - "contact" or "company"
    name          - Full name of the person (contacts only)
    company_name  - Name of the company
    company_domain- Company domain, e.g. "gymshark.com"
    linkedin_url  - LinkedIn profile or company page URL (optional)
    email         - Email address (contacts only, optional)
"""

import csv
import json
import sys
import argparse
from datetime import date


REQUIRED_COLUMNS = {"type"}
CONTACT_IDENTIFIER_COLUMNS = {"name", "company_name", "company_domain"}
COMPANY_IDENTIFIER_COLUMNS = {"company_name", "company_domain"}


def parse_args():
    parser = argparse.ArgumentParser(description="Upload a CSV of contacts and companies.")
    parser.add_argument("csv_file", help="Path to the CSV file to upload")
    parser.add_argument(
        "--output",
        default="uploaded_data.json",
        help="Output JSON file (default: uploaded_data.json)",
    )
    return parser.parse_args()


def validate_columns(fieldnames):
    fieldnames_lower = {f.strip().lower() for f in fieldnames}
    missing = REQUIRED_COLUMNS - fieldnames_lower
    if missing:
        print(f"Error: CSV is missing required column(s): {', '.join(missing)}")
        sys.exit(1)

    has_contact_id = bool(CONTACT_IDENTIFIER_COLUMNS & fieldnames_lower)
    has_company_id = bool(COMPANY_IDENTIFIER_COLUMNS & fieldnames_lower)
    if not has_contact_id and not has_company_id:
        print(
            "Error: CSV must have at least one of: "
            "name, company_name, company_domain"
        )
        sys.exit(1)


def get_company_identifier(row):
    """Return domain if available, else company name, else None."""
    domain = row.get("company_domain", "").strip()
    name = row.get("company_name", "").strip()
    return domain if domain else (name if name else None)


def process_csv(csv_path):
    contacts = []
    companies = []
    errors = []

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = [name.strip().lower() for name in (reader.fieldnames or [])]

        if not fieldnames:
            print("Error: CSV file is empty or has no headers.")
            sys.exit(1)

        # Normalize fieldnames
        reader.fieldnames = fieldnames
        validate_columns(fieldnames)

        for line_num, raw_row in enumerate(reader, start=2):
            row = {k.strip().lower(): v.strip() for k, v in raw_row.items() if k}
            row_type = row.get("type", "").strip().lower()

            if row_type == "contact":
                name = row.get("name", "").strip()
                company_id = get_company_identifier(row)

                if not name:
                    errors.append(f"Line {line_num}: contact row missing 'name'")
                    continue
                if not company_id:
                    errors.append(
                        f"Line {line_num}: contact '{name}' missing company_name or company_domain"
                    )
                    continue

                contact = {"contactName": name, "companyIdentifier": company_id}
                if row.get("linkedin_url"):
                    contact["linkedinUrl"] = row["linkedin_url"]
                if row.get("email"):
                    contact["email"] = row["email"]
                contacts.append(contact)

            elif row_type == "company":
                company_name = row.get("company_name", "").strip()
                domain = row.get("company_domain", "").strip()

                if not company_name and not domain:
                    errors.append(
                        f"Line {line_num}: company row missing both company_name and company_domain"
                    )
                    continue

                company = {}
                if company_name:
                    company["companyName"] = company_name
                if domain:
                    company["companyDomain"] = domain
                if row.get("linkedin_url"):
                    company["linkedinUrl"] = row["linkedin_url"]
                companies.append(company)

            elif row_type == "":
                # Skip blank rows
                continue
            else:
                errors.append(
                    f"Line {line_num}: unknown type '{row_type}' (must be 'contact' or 'company')"
                )

    return contacts, companies, errors


def main():
    args = parse_args()

    print(f"Reading: {args.csv_file}")
    contacts, companies, errors = process_csv(args.csv_file)

    if errors:
        print("\nWarnings / skipped rows:")
        for err in errors:
            print(f"  - {err}")

    output = {
        "upload_date": date.today().isoformat(),
        "source_file": args.csv_file,
        "summary": {
            "total_contacts": len(contacts),
            "total_companies": len(companies),
            "skipped_rows": len(errors),
        },
        "contacts": contacts,
        "companies": companies,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"\nDone.")
    print(f"  Contacts parsed : {len(contacts)}")
    print(f"  Companies parsed: {len(companies)}")
    print(f"  Skipped rows    : {len(errors)}")
    print(f"  Output saved to : {args.output}")


if __name__ == "__main__":
    main()
