// Writes to the leads / lead_category_events tables. Shared by the daily sync
// and the webhook handler so both merge into the same records.
import crypto from "node:crypto";
import type { Client, InStatement } from "@libsql/client";

/**
 * Leads are stored under a one-way hash of their email, never the address
 * itself: enough to match a webhook to the daily sync, nothing to leak.
 */
export function leadKey(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 20);
}

export type LeadUpsert = {
  campaign_id: number;
  email: string;
  lead_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  /** undefined = leave unchanged; null = uncategorised */
  category?: string | null;
  replied?: boolean;
  reply_at?: string | null;
  reply_source?: "webhook" | "snapshot";
  download_date_field?: string | null;
};

export function leadUpsertStatement(l: LeadUpsert, nowIso: string): InStatement {
  return {
    sql: `
      INSERT INTO leads (campaign_id, email, lead_id, first_name, last_name, company, category, replied, reply_at, reply_source, download_date_field, updated_at)
      VALUES (:campaign_id, :email, :lead_id, :first_name, :last_name, :company, :category, :replied, :reply_at, :reply_source, :download_date_field, :now)
      ON CONFLICT(campaign_id, email) DO UPDATE SET
        lead_id = COALESCE(excluded.lead_id, leads.lead_id),
        first_name = COALESCE(excluded.first_name, leads.first_name),
        last_name = COALESCE(excluded.last_name, leads.last_name),
        company = COALESCE(excluded.company, leads.company),
        category = CASE WHEN :set_category THEN excluded.category ELSE leads.category END,
        replied = MAX(leads.replied, excluded.replied),
        reply_source = CASE WHEN excluded.reply_at IS NOT NULL AND (leads.reply_at IS NULL OR excluded.reply_at < leads.reply_at)
                            THEN excluded.reply_source ELSE leads.reply_source END,
        reply_at = CASE WHEN excluded.reply_at IS NOT NULL AND (leads.reply_at IS NULL OR excluded.reply_at < leads.reply_at)
                        THEN excluded.reply_at ELSE leads.reply_at END,
        download_date_field = COALESCE(excluded.download_date_field, leads.download_date_field),
        updated_at = excluded.updated_at`,
    args: {
      campaign_id: l.campaign_id,
      email: leadKey(l.email),
      lead_id: l.lead_id ?? null,
      first_name: l.first_name ?? null,
      last_name: l.last_name ?? null,
      company: l.company ?? null,
      category: l.category ?? null,
      set_category: l.category !== undefined ? 1 : 0,
      replied: l.replied ? 1 : 0,
      reply_at: l.replied ? (l.reply_at ?? null) : null,
      reply_source: l.replied ? (l.reply_source ?? null) : null,
      download_date_field: l.download_date_field ?? null,
      now: nowIso,
    },
  };
}

/** Record the first time a lead was seen in a category (per source); later sightings are ignored. */
export function categoryEventStatement(
  campaign_id: number,
  email: string,
  category: string,
  occurred_at: string,
  source: "webhook" | "snapshot",
): InStatement {
  return {
    sql: `INSERT OR IGNORE INTO lead_category_events (campaign_id, email, category, occurred_at, source) VALUES (?, ?, ?, ?, ?)`,
    args: [campaign_id, leadKey(email), category, occurred_at, source],
  };
}

export async function runBatch(db: Client, stmts: InStatement[], chunk = 200) {
  for (let i = 0; i < stmts.length; i += chunk) await db.batch(stmts.slice(i, i + chunk), "write");
}
