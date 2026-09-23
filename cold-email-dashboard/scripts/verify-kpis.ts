/**
 * Verifies every KPI against an independent calculation.
 *
 * Generates the mock dataset for a fixed "today", then recomputes each KPI with
 * plain SQL + arithmetic written separately from lib/metrics, and compares the
 * two. Prints a worked example for one period so the numbers can be checked by
 * hand.
 *
 * Usage: npm run verify            (today = 2026-09-23)
 *        npm run verify -- 2026-10-15
 */
import type { Client } from "@libsql/client";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { createMemoryDb } from "../lib/db";
import { addDays, PERIODS, resolvePeriod } from "../lib/dates";
import { allTimeStart, computeCampaignTable, computeKpis } from "../lib/metrics/compute";
import { MOCK_HISTORY_DAYS, seedMockDb } from "../lib/mock/generate";
import { loadDataset } from "../lib/repository";

const TODAY = process.argv[2] || "2026-09-23";

async function one(db: Client, sql: string, args: (string | number)[] = []): Promise<number> {
  const r = await db.execute({ sql, args });
  return Number(Object.values(r.rows[0] ?? {})[0] ?? 0);
}

// Independent period spend: walk day by day, each day costs monthly ÷ days-in-that-month.
function spendByDay(monthly: number, costStart: string, start: string, end: string, today: string) {
  let total = 0;
  for (let d = start; d <= end && d <= today; d = addDays(d, 1)) {
    if (d < costStart) continue;
    const [y, m] = d.split("-").map(Number);
    total += monthly / new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  return total;
}

// Mock timestamps are all midday UTC, so the first 10 characters are the London day.
const LEAD_DATES_SQL = `
WITH ev AS (
  SELECT campaign_id, email, category, source, MIN(substr(occurred_at, 1, 10)) AS d
  FROM lead_category_events GROUP BY 1, 2, 3, 4
),
dl AS (
  SELECT l.campaign_id, l.email,
    COALESCE(
      (SELECT d FROM ev WHERE ev.campaign_id = l.campaign_id AND ev.email = l.email AND category = 'Downloaded' AND source = 'webhook'),
      l.download_date_field,
      (SELECT d FROM ev WHERE ev.campaign_id = l.campaign_id AND ev.email = l.email AND category = 'Downloaded' AND source = 'snapshot')
    ) AS download_day
  FROM leads l
),
pos AS (
  SELECT campaign_id, email, MIN(d) AS positive_day FROM (
    SELECT campaign_id, email,
      COALESCE(MIN(CASE WHEN source = 'webhook' THEN d END), MIN(CASE WHEN source = 'snapshot' THEN d END)) AS d
    FROM ev WHERE category IN ('Interested', 'Meeting Request') GROUP BY campaign_id, email, category
    UNION ALL
    SELECT campaign_id, email, download_day FROM dl WHERE download_day IS NOT NULL
  ) GROUP BY 1, 2
)
SELECT l.campaign_id, l.email,
  CASE WHEN l.replied = 1 AND COALESCE(l.category, '') <> 'Out Of Office' THEN substr(l.reply_at, 1, 10) END AS reply_day,
  pos.positive_day, dl.download_day
FROM leads l
LEFT JOIN pos ON pos.campaign_id = l.campaign_id AND pos.email = l.email
LEFT JOIN dl ON dl.campaign_id = l.campaign_id AND dl.email = l.email`;

async function independent(db: Client, start: string, end: string, costStart: string) {
  const before = addDays(start, -1);
  // Latest snapshot on/before a day, per campaign, summed.
  const cum = (col: string, day: string) =>
    one(
      db,
      `SELECT COALESCE(SUM(s.${col}), 0) FROM campaign_snapshots s
       WHERE s.day = (SELECT MAX(day) FROM campaign_snapshots x WHERE x.campaign_id = s.campaign_id AND x.day <= ?)`,
      [day],
    );
  const sent = (await cum("sent", end)) - (await cum("sent", before));
  const prospects = (await cum("unique_sent", end)) - (await cum("unique_sent", before));
  const bounced = (await cum("bounced", end)) - (await cum("bounced", before));
  const count = (col: string) => one(db, `SELECT COUNT(*) FROM (${LEAD_DATES_SQL}) WHERE ${col} BETWEEN ? AND ?`, [start, end]);
  const replies = await count("reply_day");
  const positives = await count("positive_day");
  const downloads = await count("download_day");
  const monthly = DEFAULT_SETTINGS.costs.reduce((s, c) => s + c.usdPerMonth, 0) * DEFAULT_SETTINGS.usdToGbp;
  const spend = spendByDay(monthly, costStart, start, end, TODAY);
  const div = (a: number, b: number) => (b ? a / b : null);
  return {
    spend,
    prospectsContacted: prospects,
    emailsSent: sent,
    replies,
    positiveReplies: positives,
    downloads,
    bounced,
    replyRate: div(replies, prospects),
    positiveReplyRate: div(positives, prospects),
    positiveShareOfReplies: div(positives, replies),
    bounceRate: div(bounced, sent),
    cpl: div(spend, positives),
    cac: div(spend, downloads),
    replyToDownloadRate: div(downloads, positives),
  };
}

const f = (v: number | null, kind: "n" | "gbp" | "pct" | "raw" = "n") =>
  v == null ? "—" : kind === "gbp" ? `£${(Math.round(v * 1e6) / 1e6).toFixed(2)}` : kind === "pct" ? `${(v * 100).toFixed(2)}%` : kind === "raw" ? String(v) : v.toLocaleString("en-GB");

async function main() {
  const db = await createMemoryDb();
  await seedMockDb(db, TODAY);
  const settings = { ...DEFAULT_SETTINGS, costStartDate: addDays(TODAY, -MOCK_HISTORY_DAYS) };
  const data = await loadDataset(db);
  const start0 = allTimeStart(data, settings);

  console.log(`Mock data for today = ${TODAY}; costs start ${settings.costStartDate}; monthly cost £${(568.66 * 0.75).toFixed(3)}\n`);

  let failures = 0;
  const kinds: Record<string, "n" | "gbp" | "pct"> = {
    spend: "gbp", cpl: "gbp", cac: "gbp",
    replyRate: "pct", positiveReplyRate: "pct", positiveShareOfReplies: "pct", bounceRate: "pct", replyToDownloadRate: "pct",
  };
  for (const p of PERIODS) {
    const period = resolvePeriod(p.key, TODAY, start0);
    const app = computeKpis(data, settings, period, TODAY) as unknown as Record<string, number | null>;
    const ind = (await independent(db, period.start, period.end, settings.costStartDate)) as Record<string, number | null>;
    const rows = Object.keys(ind).map((k) => {
      const a = app[k];
      const b = ind[k];
      const ok = a == null || b == null ? a === b : Math.abs(a - b) < 1e-9;
      if (!ok) failures++;
      return { KPI: k, dashboard: f(a, kinds[k]), independent: f(b, kinds[k]), match: ok ? "✓" : "✗ MISMATCH" };
    });
    console.log(`${p.label} (${period.start} → ${period.end}), campaigns launched: ${app.campaignsLaunched}`);
    console.table(rows);
  }

  // Worked example: last month, by hand.
  const lm = resolvePeriod("last_month", TODAY, start0);
  const k = computeKpis(data, settings, lm, TODAY);
  const days = Number(lm.end.slice(8));
  console.log(`\nWorked example: ${lm.label} (${lm.start} → ${lm.end})`);
  console.log(`  Monthly cost      = $94 + $189.58 + $249 + $23.08 + $13 = $568.66 × 0.75 = £426.495`);
  console.log(`  Spend             = £426.495 × ${days}/${days} days = £${k.spend.toFixed(3)}`);
  console.log(`  Reply rate        = ${k.replies} ÷ ${k.prospectsContacted} = ${f(k.replyRate, "pct")}`);
  console.log(`  Positive rate     = ${k.positiveReplies} ÷ ${k.prospectsContacted} = ${f(k.positiveReplyRate, "pct")}  (${f(k.positiveShareOfReplies, "pct")} of replies)`);
  console.log(`  Bounce rate       = ${k.bounced} ÷ ${k.emailsSent} = ${f(k.bounceRate, "pct")}`);
  console.log(`  CPL               = £${k.spend.toFixed(3)} ÷ ${k.positiveReplies} = ${f(k.cpl, "gbp")}`);
  console.log(`  CAC               = £${k.spend.toFixed(3)} ÷ ${k.downloads} = ${f(k.cac, "gbp")}`);
  console.log(`  Reply → download  = ${k.downloads} ÷ ${k.positiveReplies} = ${f(k.replyToDownloadRate, "pct")}`);

  console.log(`\n  Allocated spend (spend × campaign emails ÷ ${k.emailsSent} total emails):`);
  let allocSum = 0;
  for (const r of computeCampaignTable(data, settings, lm, TODAY)) {
    const expected = k.emailsSent ? (k.spend * r.emailsSent) / k.emailsSent : 0;
    allocSum += r.allocatedSpend;
    if (Math.abs(expected - r.allocatedSpend) > 1e-9) failures++;
    console.log(
      `    ${r.name.padEnd(36)} £${k.spend.toFixed(2)} × ${String(r.emailsSent).padStart(5)} ÷ ${k.emailsSent} = £${r.allocatedSpend.toFixed(2)}` +
        `  CAC ${f(r.cac, "gbp")}  bounce ${f(r.bounceRate, "pct")}${r.bounceRate != null && r.bounceRate > 0.03 ? "  ▲ red" : ""}`,
    );
  }
  if (Math.abs(allocSum - k.spend) > 1e-6) failures++;
  console.log(`    Sum of allocated spend = £${allocSum.toFixed(2)} (should equal total spend £${k.spend.toFixed(2)})`);

  console.log(failures ? `\n✗ ${failures} mismatch(es)` : `\n✓ All KPIs match the independent calculation.`);
  process.exit(failures ? 1 : 0);
}

main();
