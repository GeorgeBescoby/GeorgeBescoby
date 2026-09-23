// Daily sync: pulls Smartlead data into the database. Run by the scheduled job
// and the "Refresh now" button. Pages never call Smartlead directly.
//
// Per run (N = launched campaigns):
//   1   GET /leads/fetch-categories
//   1   GET /campaigns/
//   N   GET /campaigns/{id}/analytics                     -> today's cumulative snapshot
//      (fallback: GET /campaigns/{id}/analytics-by-date in 30-day windows, if /analytics lacks a field)
//   N+  GET /campaigns/{id}/statistics?email_status=replied -> reply timestamps
//   N+  GET /campaigns/{id}/leads?emailStatus=is_replied   -> replied leads + category
//   N×k GET /campaigns/{id}/leads?lead_category_id=…       -> positive/Downloaded leads that never replied
//   1+  GET /email-accounts/                               -> inbox health (stored for the Health view)
import type { Client, InStatement } from "@libsql/client";
import { addDays, londonDay, minDay, type Day } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { getRequestCount, smartleadGet } from "./client";
import {
  parseAnalyticsByDate,
  parseCampaignAnalytics,
  type SLCampaignTotals,
  parseCampaigns,
  parseCategories,
  parseEmailAccounts,
  parseLeadsPage,
  parseReplyTimes,
  type SLLead,
} from "./normalize";
import { categoryEventStatement, leadUpsertStatement, runBatch } from "./store";

const PAGE = 100; // /campaigns/{id}/leads max page size
const STATS_PAGE = 1000; // /campaigns/{id}/statistics max page size
const MAX_PAGES = 200; // safety stop
const SKIP_STATUSES = new Set(["DRAFTED"]);

export type SyncResult = { ok: boolean; message: string; apiCalls: number; skipped?: boolean };

async function fetchAllLeads(campaignId: number, filter: Record<string, string | number>): Promise<SLLead[]> {
  const out: SLLead[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await smartleadGet(`/campaigns/${campaignId}/leads`, { offset: page * PAGE, limit: PAGE, ...filter });
    const { leads, total } = parseLeadsPage(data);
    out.push(...leads);
    if (leads.length < PAGE || (total !== null && out.length >= total)) break;
  }
  return out;
}

/**
 * Lifetime totals by summing 30-day analytics-by-date windows (the endpoint's
 * max range) from campaign creation to today. Exact for unique_sent because a
 * lead's first-sequence email happens once.
 */
async function totalsFromDateWindows(campaignId: number, createdAt: string | null, day: Day): Promise<SLCampaignTotals> {
  const total: SLCampaignTotals = { sent: 0, unique_sent: 0, bounced: 0, replies_total: 0 };
  let start = createdAt ? londonDay(new Date(createdAt)) : addDays(day, -365);
  while (start <= day) {
    const end = minDay(addDays(start, 29), day);
    const w = parseAnalyticsByDate(
      await smartleadGet(`/campaigns/${campaignId}/analytics-by-date`, { start_date: start, end_date: end, timezone: "Europe/London" }),
    );
    total.sent += w.sent;
    total.unique_sent += w.unique_sent;
    total.bounced += w.bounced;
    total.replies_total! += w.replies_total ?? 0;
    start = addDays(end, 1);
  }
  return total;
}

async function fetchReplyTimes(campaignId: number): Promise<Map<string, string>> {
  const all = new Map<string, string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await smartleadGet(`/campaigns/${campaignId}/statistics`, {
      offset: page * STATS_PAGE,
      limit: STATS_PAGE,
      email_status: "replied",
    });
    const { rows, replyAt } = parseReplyTimes(data);
    for (const [email, t] of replyAt) if (!all.has(email) || t < all.get(email)!) all.set(email, t);
    if (rows < STATS_PAGE) break;
  }
  return all;
}

export async function runSync(db: Client, trigger: "cron" | "manual" | "cli"): Promise<SyncResult> {
  // Don't overlap runs, and throttle manual refreshes.
  const recent = await db.execute(
    "SELECT status, started_at FROM sync_runs WHERE started_at > ? ORDER BY id DESC LIMIT 1",
    [new Date(Date.now() - 15 * 60_000).toISOString()],
  );
  const last = recent.rows[0];
  if (last?.status === "running") return { ok: false, skipped: true, message: "A sync is already running.", apiCalls: 0 };
  if (trigger === "manual" && last && Date.parse(String(last.started_at)) > Date.now() - 5 * 60_000) {
    return { ok: true, skipped: true, message: "Refreshed less than 5 minutes ago, try again shortly.", apiCalls: 0 };
  }

  const startedAt = new Date().toISOString();
  const run = await db.execute("INSERT INTO sync_runs (started_at, status) VALUES (?, 'running') RETURNING id", [startedAt]);
  const runId = Number(run.rows[0].id);
  const callsBefore = getRequestCount();

  try {
    const settings = await getSettings(db);
    const nowIso = new Date().toISOString();
    const day = londonDay();

    // 1. Categories (id -> name)
    const categories = parseCategories(await smartleadGet("/leads/fetch-categories"));
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const wanted = new Set([...settings.positiveCategories, settings.downloadCategory].map((s) => s.toLowerCase()));
    const wantedCategoryIds = categories.filter((c) => wanted.has(c.name.toLowerCase())).map((c) => c.id);

    // 2. Campaigns
    const campaigns = parseCampaigns(await smartleadGet("/campaigns/"));
    await runBatch(
      db,
      campaigns.map((c) => ({
        sql: `INSERT INTO campaigns (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status, updated_at = excluded.updated_at`,
        args: [c.id, c.name, c.status, c.created_at, c.updated_at],
      })),
    );

    let leadCount = 0;
    for (const c of campaigns.filter((c) => !SKIP_STATUSES.has(c.status))) {
      // 3. Cumulative totals -> today's snapshot (a later run on the same day overwrites it)
      const totals =
        parseCampaignAnalytics(await smartleadGet(`/campaigns/${c.id}/analytics`)) ??
        (await totalsFromDateWindows(c.id, c.created_at, day));
      await db.execute({
        sql: `INSERT INTO campaign_snapshots (campaign_id, day, sent, unique_sent, bounced, replies_total, taken_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(campaign_id, day) DO UPDATE SET sent = excluded.sent, unique_sent = excluded.unique_sent,
                bounced = excluded.bounced, replies_total = excluded.replies_total, taken_at = excluded.taken_at`,
        args: [c.id, day, totals.sent, totals.unique_sent, totals.bounced, totals.replies_total, nowIso],
      });
      if (totals.sent === 0) continue; // nothing sent yet: no replies or categories to fetch

      // 4. Leads that replied (+ reply timestamps), and categorised leads that never replied
      const replyTimes = await fetchReplyTimes(c.id);
      const replied = await fetchAllLeads(c.id, { emailStatus: "is_replied" });
      const byEmail = new Map<string, { lead: SLLead; replied: boolean }>();
      for (const l of replied) byEmail.set(l.email, { lead: l, replied: true });
      for (const catId of wantedCategoryIds) {
        for (const l of await fetchAllLeads(c.id, { lead_category_id: catId })) {
          if (!byEmail.has(l.email)) byEmail.set(l.email, { lead: l, replied: false });
        }
      }

      const stmts: InStatement[] = [];
      for (const { lead, replied } of byEmail.values()) {
        const category = lead.category_id != null ? (catName.get(lead.category_id) ?? `Category ${lead.category_id}`) : null;
        stmts.push(
          leadUpsertStatement(
            {
              campaign_id: c.id,
              email: lead.email,
              lead_id: lead.lead_id,
              first_name: lead.first_name,
              last_name: lead.last_name,
              company: lead.company,
              category,
              replied,
              // Exact reply time when Smartlead gives it; otherwise "first seen replied" = now.
              reply_at: replyTimes.get(lead.email) ?? nowIso,
              reply_source: "snapshot",
              download_date_field: lead.download_date_field,
            },
            nowIso,
          ),
        );
        if (category) stmts.push(categoryEventStatement(c.id, lead.email, category, day, "snapshot"));
      }
      await runBatch(db, stmts);
      leadCount += byEmail.size;
    }

    // 5. Inbox health (not displayed in v1; builds history for the Health view)
    const accountStmts: InStatement[] = [];
    for (let page = 0; page < 20; page++) {
      const accounts = parseEmailAccounts(await smartleadGet("/email-accounts/", { offset: page * 100, limit: 100 }));
      for (const a of accounts) {
        accountStmts.push({
          sql: `INSERT INTO email_account_snapshots (account_id, day, email, warmup_status, warmup_reputation, daily_sent, raw)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(account_id, day) DO UPDATE SET email = excluded.email, warmup_status = excluded.warmup_status,
                  warmup_reputation = excluded.warmup_reputation, daily_sent = excluded.daily_sent, raw = excluded.raw`,
          args: [a.id, day, a.email, a.warmup_status, a.warmup_reputation, a.daily_sent, a.raw],
        });
      }
      if (accounts.length < 100) break;
    }
    await runBatch(db, accountStmts);

    const apiCalls = getRequestCount() - callsBefore;
    const message = `${campaigns.length} campaigns, ${leadCount} replied/categorised leads, ${accountStmts.length} inboxes`;
    await db.execute("UPDATE sync_runs SET status = 'ok', finished_at = ?, message = ?, api_calls = ? WHERE id = ?", [
      new Date().toISOString(),
      message,
      apiCalls,
      runId,
    ]);
    return { ok: true, message, apiCalls };
  } catch (e) {
    const apiCalls = getRequestCount() - callsBefore;
    const message = (e as Error).message.slice(0, 500);
    await db.execute("UPDATE sync_runs SET status = 'error', finished_at = ?, message = ?, api_calls = ? WHERE id = ?", [
      new Date().toISOString(),
      message,
      apiCalls,
      runId,
    ]);
    return { ok: false, message, apiCalls };
  }
}
