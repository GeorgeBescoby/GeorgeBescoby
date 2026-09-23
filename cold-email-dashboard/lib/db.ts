// Database access. libSQL speaks SQLite: locally it's a file (file:./data/dashboard.db),
// in production it can be the same file on a Railway volume or a Turso database.
//
// Two databases:
//  - main: settings + live Smartlead data (DATABASE_URL)
//  - mock: an in-memory database filled with generated sample data (see lib/mock)
import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

-- Cumulative Smartlead totals per campaign, one row per London day (latest sync of the day wins).
CREATE TABLE IF NOT EXISTS campaign_snapshots (
  campaign_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  sent INTEGER NOT NULL,          -- emails sent, all sequence steps
  unique_sent INTEGER NOT NULL,   -- unique leads sent at least one email
  bounced INTEGER NOT NULL,       -- bounced emails
  replies_total INTEGER,          -- raw reply count (informational)
  taken_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, day)
);

-- Current state of every lead that has replied or been categorised.
CREATE TABLE IF NOT EXISTS leads (
  campaign_id INTEGER NOT NULL,
  email TEXT NOT NULL,            -- lower-cased; leads are identified by (campaign, email)
  lead_id INTEGER,                -- Smartlead lead id, when known
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  category TEXT,                  -- current lead category name (NULL = uncategorised)
  replied INTEGER NOT NULL DEFAULT 0,
  reply_at TEXT,                  -- ISO timestamp of first reply we know about
  reply_source TEXT,              -- 'webhook' | 'snapshot'
  download_date_field TEXT,       -- custom lead field download_date, if set
  updated_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, email)
);

-- First time we saw a lead enter a category, per source. Used for
-- positive-reply dates and download dates (webhook > custom field > snapshot).
CREATE TABLE IF NOT EXISTS lead_category_events (
  campaign_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  category TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL,           -- 'webhook' | 'snapshot'
  PRIMARY KEY (campaign_id, email, category, source)
);

-- Inbox health, stored daily for the future Health view.
CREATE TABLE IF NOT EXISTS email_account_snapshots (
  account_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  email TEXT,
  warmup_status TEXT,
  warmup_reputation REAL,
  daily_sent INTEGER,
  raw TEXT,
  PRIMARY KEY (account_id, day)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  event_type TEXT,
  campaign_id INTEGER,
  email TEXT,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,           -- 'running' | 'ok' | 'error'
  message TEXT,
  api_calls INTEGER
);
`;

export async function migrate(db: Client) {
  await db.executeMultiple(SCHEMA);
}

const g = globalThis as unknown as { __mainDb?: Promise<Client> };

export function getMainDb(): Promise<Client> {
  if (!g.__mainDb) {
    g.__mainDb = (async () => {
      const url = process.env.DATABASE_URL || "file:./data/dashboard.db";
      if (url.startsWith("file:")) {
        fs.mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
      }
      const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
      await migrate(db);
      return db;
    })();
    g.__mainDb.catch(() => (g.__mainDb = undefined));
  }
  return g.__mainDb;
}

export async function createMemoryDb(): Promise<Client> {
  const db = createClient({ url: ":memory:" });
  await migrate(db);
  return db;
}
