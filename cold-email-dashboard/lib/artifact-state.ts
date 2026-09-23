// State for the claude.ai artifact version of the dashboard.
//
// The artifact's built-in database (max 5,000 docs, 256 KiB each) holds all
// history. A daily Claude routine reads it into files, imports them into a
// throwaway SQLite database, runs the normal Smartlead sync on top, and writes
// the result back. Documents:
//
//   settings/main          { settings, dataMode }            (edited on the page)
//   meta/sync              { status, finished_at, message }
//   campaigns/<id>         { id, name, status, created_at, snapshots: [[day, sent, unique_sent, bounced]] }
//   leads/<id>-<n>         { campaign_id, rows: [[key, category, replied, reply_at, download_date_field, events]] }
//                          events = [[category, occurred_at, source]]; key = hashed email (never the address)
//   health/<YYYY-MM>       { days: { "<day>": [[account_id, email, warmup_status, reputation, daily_sent]] } }
//
// Pure data mapping, shared by the routine script (Node) and the page (browser).
import type { CampaignRow, CategoryEventRow, Dataset, LeadRow, SnapshotRow } from "./metrics/types";

export type Doc = { collection: string; doc_id: string; data: Record<string, unknown> };

export type CampaignDoc = {
  id: number;
  name: string;
  status: string;
  created_at: string | null;
  snapshots: [string, number, number, number][];
};

export type LeadEvent = [category: string, occurred_at: string, source: "webhook" | "snapshot"];
export type LeadTuple = [
  key: string,
  category: string | null,
  replied: number,
  reply_at: string | null,
  download_date_field: string | null,
  events: LeadEvent[],
];
export type LeadsDoc = { campaign_id: number; rows: LeadTuple[] };

export type HealthRow = [account_id: number, email: string | null, status: string | null, reputation: number | null, daily_sent: number | null];
export type HealthDoc = { days: Record<string, HealthRow[]> };

export const LEADS_PER_DOC = 600; // keeps each document well under 256 KiB

/** Turn the artifact documents into the Dataset the KPI code reads. */
export function datasetFromDocs(campaignDocs: CampaignDoc[], leadDocs: LeadsDoc[]): Dataset {
  const campaigns: CampaignRow[] = [];
  const snapshots: SnapshotRow[] = [];
  for (const c of campaignDocs) {
    campaigns.push({ id: Number(c.id), name: c.name, status: c.status, created_at: c.created_at });
    for (const [day, sent, unique_sent, bounced] of c.snapshots ?? []) {
      snapshots.push({ campaign_id: Number(c.id), day, sent, unique_sent, bounced });
    }
  }
  const leads: LeadRow[] = [];
  const categoryEvents: CategoryEventRow[] = [];
  for (const d of leadDocs) {
    for (const [key, category, replied, reply_at, download_date_field, events] of d.rows ?? []) {
      leads.push({
        campaign_id: Number(d.campaign_id),
        email: key,
        lead_id: null,
        first_name: null,
        last_name: null,
        company: null,
        category,
        replied,
        reply_at,
        download_date_field,
      });
      for (const [cat, occurred_at, source] of events ?? []) {
        categoryEvents.push({ campaign_id: Number(d.campaign_id), email: key, category: cat, occurred_at, source });
      }
    }
  }
  return { campaigns, snapshots, leads, categoryEvents };
}

/** Accept either a bare document body or a `{ data, version, ... }` wrapper. */
export function unwrapDoc(json: any): Record<string, unknown> {
  if (json && typeof json === "object" && json.data && typeof json.data === "object" && ("version" in json || "id" in json)) {
    return json.data;
  }
  return json;
}
