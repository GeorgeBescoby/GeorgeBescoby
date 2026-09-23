// Tolerant parsers for Smartlead responses.
//
// The official docs show different shapes for the same endpoint on different
// pages (e.g. GET /campaigns/ is documented both as a bare array and as
// { campaigns: [...] }; counts are sometimes strings). Each parser accepts the
// documented variants. Run `npm run explore` with a real key to confirm which
// one your account returns (see docs/SMARTLEAD_API.md).

export function asArray(data: unknown, ...keys: string[]): any[] {
  if (Array.isArray(data)) return data;
  for (const k of keys) {
    const v = (data as any)?.[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      for (const k2 of keys) if (Array.isArray((v as any)[k2])) return (v as any)[k2];
    }
  }
  return [];
}

/** First key present, coerced to a number ("123" -> 123, "98%" -> 98). */
export function num(obj: any, ...keys: string[]): number | null {
  for (const k of keys) {
    let v = obj?.[k];
    if (typeof v === "string") v = v.replace(/[%,\s]/g, "");
    if (v !== undefined && v !== null && v !== "" && !isNaN(Number(v))) return Number(v);
  }
  return null;
}

export type SLCampaign = { id: number; name: string; status: string; created_at: string | null; updated_at: string | null };

export function parseCampaigns(data: unknown): SLCampaign[] {
  return asArray(data, "campaigns", "data")
    .filter((c) => c && c.id != null)
    .map((c) => ({
      id: Number(c.id),
      name: String(c.name ?? `Campaign ${c.id}`),
      status: String(c.status ?? "UNKNOWN").toUpperCase(),
      created_at: c.created_at ?? null,
      updated_at: c.updated_at ?? null,
    }));
}

export type SLCategory = { id: number; name: string; sentiment: string | null };

export function parseCategories(data: unknown): SLCategory[] {
  return asArray(data, "data", "categories")
    .filter((c) => c && c.id != null)
    .map((c) => ({ id: Number(c.id), name: String(c.name), sentiment: c.sentiment_type ?? null }));
}

export type SLCampaignTotals = { sent: number; unique_sent: number; bounced: number; replies_total: number | null };

/**
 * Cumulative totals from GET /campaigns/{id}/analytics. Returns null when the
 * response lacks unique-sent or bounce counts (the docs' example only has
 * total_sent + rates); the sync then rebuilds totals from analytics-by-date.
 */
export function parseCampaignAnalytics(data: unknown): SLCampaignTotals | null {
  const d: any = (data as any)?.data && !Array.isArray((data as any).data) ? (data as any).data : data;
  const sent = num(d, "sent_count", "total_sent");
  const uniqueSent = num(d, "unique_sent_count");
  const bounced = num(d, "bounce_count", "total_bounced");
  if (sent === null || uniqueSent === null || bounced === null) return null;
  return { sent, unique_sent: uniqueSent, bounced, replies_total: num(d, "total_reply_count", "reply_count", "total_replied") };
}

/** One window of GET /campaigns/{id}/analytics-by-date (all counts are strings). */
export function parseAnalyticsByDate(data: unknown): SLCampaignTotals {
  const d: any = (data as any)?.data && !Array.isArray((data as any).data) ? (data as any).data : data;
  const sent = num(d, "sent_count");
  if (sent === null) throw new Error(`Unrecognised analytics-by-date response; keys: ${Object.keys(d ?? {}).join(", ")}`);
  return {
    sent,
    unique_sent: num(d, "unique_sent_count") ?? 0,
    bounced: num(d, "bounce_count") ?? 0,
    replies_total: num(d, "total_reply_count", "reply_count"),
  };
}

export type SLLead = {
  lead_id: number | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  category_id: number | null;
  download_date_field: string | null;
};

/** One page of GET /campaigns/{id}/leads. */
export function parseLeadsPage(data: unknown): { leads: SLLead[]; total: number | null } {
  const items = asArray(data, "data", "leads");
  const leads: SLLead[] = [];
  for (const item of items) {
    const lead = item?.lead ?? item;
    const email = String(lead?.email ?? "").trim().toLowerCase();
    if (!email) continue;
    const custom = lead?.custom_fields ?? {};
    const dlKey = Object.keys(custom).find((k) => k.toLowerCase().replace(/[\s-]/g, "_") === "download_date");
    leads.push({
      lead_id: lead?.id != null ? Number(lead.id) : null,
      email,
      first_name: lead?.first_name ?? null,
      last_name: lead?.last_name ?? null,
      company: lead?.company_name ?? null,
      category_id: item?.lead_category_id != null ? Number(item.lead_category_id) : null,
      download_date_field: dlKey ? String(custom[dlKey] ?? "") || null : null,
    });
  }
  return { leads, total: num(data, "total_leads", "total", "count") };
}

/** GET /campaigns/{id}/statistics?email_status=replied: earliest reply time per lead email, if the response carries it. */
export function parseReplyTimes(data: unknown): { rows: number; replyAt: Map<string, string> } {
  const items = asArray(data, "data", "statistics");
  const replyAt = new Map<string, string>();
  for (const s of items) {
    const email = String(s?.lead_email ?? s?.email ?? "").toLowerCase();
    const t = s?.reply_time ?? s?.replied_at ?? null;
    if (!email || !t) continue;
    const prev = replyAt.get(email);
    if (!prev || t < prev) replyAt.set(email, String(t));
  }
  return { rows: items.length, replyAt };
}

export type SLEmailAccount = {
  id: number;
  email: string | null;
  warmup_status: string | null;
  warmup_reputation: number | null;
  daily_sent: number | null;
  raw: string;
};

export function parseEmailAccounts(data: unknown): SLEmailAccount[] {
  return asArray(data, "data", "email_accounts")
    .filter((a) => a && a.id != null)
    .map((a) => {
      const w = a.warmup_details ?? {};
      return {
        id: Number(a.id),
        email: a.from_email ?? a.username ?? null,
        warmup_status: w.status ?? null,
        warmup_reputation: num(w, "warmup_reputation", "reputation_score"),
        daily_sent: num(a, "daily_sent_count"),
        raw: JSON.stringify({ ...a, signature: undefined }),
      };
    });
}
