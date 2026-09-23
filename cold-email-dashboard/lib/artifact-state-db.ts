// Node side of lib/artifact-state.ts: artifact documents <-> SQLite tables.
import type { Client, InStatement } from "@libsql/client";
import type { CampaignDoc, Doc, HealthDoc, HealthRow, LeadsDoc, LeadTuple } from "./artifact-state";
import { LEADS_PER_DOC } from "./artifact-state";
import { runBatch } from "./smartlead/store";

/** Load documents (as read from the artifact) into an empty database. */
export async function importDocs(db: Client, docs: Doc[]) {
  const stmts: InStatement[] = [];
  for (const { collection, data } of docs) {
    if (collection === "campaigns") {
      const c = data as unknown as CampaignDoc;
      stmts.push({
        sql: "INSERT OR REPLACE INTO campaigns (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        args: [c.id, c.name, c.status, c.created_at, c.created_at],
      });
      for (const [day, sent, unique_sent, bounced] of c.snapshots ?? []) {
        stmts.push({
          sql: "INSERT OR REPLACE INTO campaign_snapshots (campaign_id, day, sent, unique_sent, bounced, taken_at) VALUES (?, ?, ?, ?, ?, ?)",
          args: [c.id, day, sent, unique_sent, bounced, `${day}T23:59:00Z`],
        });
      }
    } else if (collection === "leads") {
      const d = data as unknown as LeadsDoc;
      for (const [key, category, replied, reply_at, dl, events] of d.rows ?? []) {
        stmts.push({
          sql: `INSERT OR REPLACE INTO leads (campaign_id, email, category, replied, reply_at, reply_source, download_date_field, updated_at)
                VALUES (?, ?, ?, ?, ?, 'snapshot', ?, ?)`,
          args: [d.campaign_id, key, category, replied, reply_at, dl, new Date().toISOString()],
        });
        for (const [cat, at, source] of events ?? []) {
          stmts.push({
            sql: "INSERT OR IGNORE INTO lead_category_events (campaign_id, email, category, occurred_at, source) VALUES (?, ?, ?, ?, ?)",
            args: [d.campaign_id, key, cat, at, source],
          });
        }
      }
    } else if (collection === "health") {
      const h = data as unknown as HealthDoc;
      for (const [day, rows] of Object.entries(h.days ?? {})) {
        for (const [id, email, status, rep, sent] of rows) {
          stmts.push({
            sql: `INSERT OR REPLACE INTO email_account_snapshots (account_id, day, email, warmup_status, warmup_reputation, daily_sent)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [id, day, email, status, rep, sent],
          });
        }
      }
    }
  }
  await runBatch(db, stmts, 500);
}

/** Export the database as artifact documents. */
export async function exportDocs(db: Client): Promise<Doc[]> {
  const rows = async (sql: string) => (await db.execute(sql)).rows.map((r) => ({ ...r }) as Record<string, any>);
  const docs: Doc[] = [];

  const snaps = await rows("SELECT campaign_id, day, sent, unique_sent, bounced FROM campaign_snapshots ORDER BY day");
  for (const c of await rows("SELECT id, name, status, created_at FROM campaigns ORDER BY id")) {
    const data: CampaignDoc = {
      id: Number(c.id),
      name: String(c.name),
      status: String(c.status),
      created_at: c.created_at ?? null,
      snapshots: snaps
        .filter((s) => Number(s.campaign_id) === Number(c.id))
        .map((s) => [String(s.day), Number(s.sent), Number(s.unique_sent), Number(s.bounced)]),
    };
    docs.push({ collection: "campaigns", doc_id: String(c.id), data: data as unknown as Record<string, unknown> });
  }

  const events = await rows("SELECT campaign_id, email, category, occurred_at, source FROM lead_category_events");
  const evByLead = new Map<string, LeadTuple[5]>();
  for (const e of events) {
    const k = `${e.campaign_id}:${e.email}`;
    (evByLead.get(k) ?? evByLead.set(k, []).get(k)!).push([String(e.category), String(e.occurred_at), e.source]);
  }
  const leads = await rows("SELECT campaign_id, email, category, replied, reply_at, download_date_field FROM leads ORDER BY campaign_id, email");
  const byCampaign = new Map<number, LeadTuple[]>();
  for (const l of leads) {
    const cid = Number(l.campaign_id);
    (byCampaign.get(cid) ?? byCampaign.set(cid, []).get(cid)!).push([
      String(l.email),
      l.category ?? null,
      Number(l.replied),
      l.reply_at ?? null,
      l.download_date_field ?? null,
      evByLead.get(`${cid}:${l.email}`) ?? [],
    ]);
  }
  for (const [cid, list] of byCampaign) {
    for (let i = 0; i * LEADS_PER_DOC < list.length; i++) {
      const data: LeadsDoc = { campaign_id: cid, rows: list.slice(i * LEADS_PER_DOC, (i + 1) * LEADS_PER_DOC) };
      docs.push({ collection: "leads", doc_id: `${cid}-${i}`, data: data as unknown as Record<string, unknown> });
    }
  }

  const health = new Map<string, HealthDoc>();
  for (const h of await rows("SELECT account_id, day, email, warmup_status, warmup_reputation, daily_sent FROM email_account_snapshots ORDER BY day")) {
    const month = String(h.day).slice(0, 7);
    const doc = health.get(month) ?? health.set(month, { days: {} }).get(month)!;
    const row: HealthRow = [Number(h.account_id), h.email ?? null, h.warmup_status ?? null, h.warmup_reputation ?? null, h.daily_sent ?? null];
    (doc.days[h.day] ??= []).push(row);
  }
  for (const [month, data] of health) docs.push({ collection: "health", doc_id: month, data: data as unknown as Record<string, unknown> });

  return docs;
}
