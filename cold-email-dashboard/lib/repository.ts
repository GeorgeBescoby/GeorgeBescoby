// Reads a Dataset out of either database. Pages call loadDataset() and never
// touch Smartlead directly.
import type { Client } from "@libsql/client";
import type { CampaignRow, CategoryEventRow, Dataset, LeadRow, SnapshotRow } from "./metrics/types";

async function rows<T>(db: Client, sql: string): Promise<T[]> {
  const res = await db.execute(sql);
  return res.rows.map((r) => ({ ...r }) as unknown as T);
}

export async function loadDataset(db: Client): Promise<Dataset> {
  const [campaigns, snapshots, leads, categoryEvents] = await Promise.all([
    rows<CampaignRow>(db, "SELECT id, name, status, created_at FROM campaigns ORDER BY id"),
    rows<SnapshotRow>(db, "SELECT campaign_id, day, sent, unique_sent, bounced FROM campaign_snapshots"),
    rows<LeadRow>(
      db,
      `SELECT campaign_id, lead_id, email, first_name, last_name, company, category, replied, reply_at, download_date_field
       FROM leads`,
    ),
    rows<CategoryEventRow>(db, "SELECT campaign_id, email, category, occurred_at, source FROM lead_category_events"),
  ]);
  return {
    campaigns: campaigns.map((c) => ({ ...c, id: Number(c.id) })),
    snapshots: snapshots.map((s) => ({
      ...s,
      campaign_id: Number(s.campaign_id),
      sent: Number(s.sent),
      unique_sent: Number(s.unique_sent),
      bounced: Number(s.bounced),
    })),
    leads: leads.map((l) => ({ ...l, campaign_id: Number(l.campaign_id), lead_id: l.lead_id == null ? null : Number(l.lead_id), replied: Number(l.replied) })),
    categoryEvents: categoryEvents.map((e) => ({ ...e, campaign_id: Number(e.campaign_id) })),
  };
}

export type SyncRun = { started_at: string; finished_at: string | null; status: string; message: string | null };

export async function lastSyncRun(db: Client): Promise<SyncRun | null> {
  const r = await rows<SyncRun>(db, "SELECT started_at, finished_at, status, message FROM sync_runs ORDER BY id DESC LIMIT 1");
  return r[0] ?? null;
}
