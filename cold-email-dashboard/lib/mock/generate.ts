// Seeds a database with the sample data from ./data (kept separate so the
// browser dashboard can generate sample data without the database driver).
import type { Client } from "@libsql/client";
import { londonDay, type Day } from "@/lib/dates";
import { migrate } from "@/lib/db";
import { generateMockData } from "./data";

export { generateMockData, MOCK_HISTORY_DAYS, type MockData } from "./data";

export async function seedMockDb(db: Client, todayDay: Day = londonDay()) {
  await migrate(db);
  const data = generateMockData(todayDay);
  const stmts = [
    ...data.campaigns.map((c) => ({
      sql: "INSERT INTO campaigns (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      args: [c.id, c.name, c.status, c.created_at, c.created_at],
    })),
    ...data.snapshots.map((s) => ({
      sql: "INSERT INTO campaign_snapshots (campaign_id, day, sent, unique_sent, bounced, taken_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [s.campaign_id, s.day, s.sent, s.unique_sent, s.bounced, `${s.day}T22:55:00Z`],
    })),
    ...data.leads.map((l) => ({
      sql: `INSERT INTO leads (campaign_id, lead_id, email, first_name, last_name, company, category, replied, reply_at, reply_source, download_date_field, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'snapshot', ?, ?)`,
      args: [l.campaign_id, l.lead_id, l.email, l.first_name, l.last_name, l.company, l.category, l.replied, l.reply_at, l.download_date_field, todayDay],
    })),
    ...data.events.map((e) => ({
      sql: "INSERT OR IGNORE INTO lead_category_events (campaign_id, email, category, occurred_at, source) VALUES (?, ?, ?, ?, ?)",
      args: [e.campaign_id, e.email, e.category, e.occurred_at, e.source],
    })),
  ];
  await db.batch(stmts, "write");
  return data;
}
