// Handles Smartlead webhook payloads (https://api.smartlead.ai/guides/webhook-integration).
//
//  LEAD_CATEGORY_UPDATED -> record the category change with a timestamp. This is
//                           the preferred source for download dates.
//  EMAIL_REPLY           -> record the exact reply time.
// Everything else is logged and ignored.
import type { Client } from "@libsql/client";
import { categoryEventStatement, leadUpsertStatement } from "./store";

export type WebhookResult = { handled: boolean; note: string };

export async function handleWebhook(db: Client, payload: any): Promise<WebhookResult> {
  const now = new Date().toISOString();
  const type = String(payload?.event_type ?? "");
  const campaignId = payload?.campaign_id != null ? Number(payload.campaign_id) : null;

  // Keep a trimmed copy for debugging (conversation history dropped: it can be large).
  const { history, lastReply, reply_body, ...trimmed } = payload ?? {};
  void history;
  void lastReply;
  void reply_body;

  if (type === "LEAD_CATEGORY_UPDATED") {
    const email = String(payload.lead_email ?? payload.lead_data?.email ?? payload.to ?? "").toLowerCase();
    const category = payload.category ?? payload.lead_data?.category?.name ?? null;
    await logEvent(db, now, type, campaignId, email, trimmed);
    if (!campaignId || !email || !category) return { handled: false, note: "missing campaign_id, lead email or category" };
    // Smartlead doesn't document an event timestamp for this event; receipt time is used.
    const occurredAt = payload.event_timestamp ?? payload.time ?? now;
    await db.batch(
      [
        leadUpsertStatement(
          {
            campaign_id: campaignId,
            email,
            lead_id: payload.lead_id != null ? Number(payload.lead_id) : null,
            first_name: payload.lead_data?.first_name ?? null,
            last_name: payload.lead_data?.last_name ?? null,
            company: payload.lead_data?.company_name ?? null,
            category: String(category),
          },
          now,
        ),
        categoryEventStatement(campaignId, email, String(category), occurredAt, "webhook"),
      ],
      "write",
    );
    return { handled: true, note: `${email} -> ${category}` };
  }

  if (type === "EMAIL_REPLY") {
    const email = String(payload.to_email ?? payload.lead_email ?? "").toLowerCase();
    await logEvent(db, now, type, campaignId, email, trimmed);
    if (!campaignId || !email) return { handled: false, note: "missing campaign_id or lead email" };
    const [first, ...rest] = String(payload.to_name ?? "").split(" ");
    await db.execute(
      leadUpsertStatement(
        {
          campaign_id: campaignId,
          email,
          first_name: first || null,
          last_name: rest.join(" ") || null,
          replied: true,
          reply_at: payload.time_replied ?? payload.event_timestamp ?? now,
          reply_source: "webhook",
        },
        now,
      ),
    );
    return { handled: true, note: `${email} replied` };
  }

  await logEvent(db, now, type || "UNKNOWN", campaignId, null, trimmed);
  return { handled: false, note: `ignored event ${type || "(none)"}` };
}

async function logEvent(db: Client, at: string, type: string, campaignId: number | null, email: string | null, payload: unknown) {
  await db.execute({
    sql: "INSERT INTO webhook_events (received_at, event_type, campaign_id, email, payload) VALUES (?, ?, ?, ?, ?)",
    args: [at, type, campaignId, email, JSON.stringify(payload).slice(0, 5000)],
  });
}
