/**
 * Smartlead API exploration script.
 *
 * Calls every endpoint the dashboard relies on and prints the *real* response
 * shape (keys and value types, arrays truncated), so the normalisers in
 * lib/smartlead/normalize.ts can be checked against reality rather than docs.
 *
 * Usage:  SMARTLEAD_API_KEY=... npm run explore
 *   (or put SMARTLEAD_API_KEY in .env)
 *
 * Full raw responses are written to ./explore-output/ (git-ignored: it can
 * contain lead names and emails).
 */
import fs from "node:fs";
import path from "node:path";
import { smartleadGet, SmartleadError, getRequestCount } from "../lib/smartlead/client";

try {
  process.loadEnvFile?.(".env");
} catch {
  /* no .env file */
}

const OUT_DIR = path.join(process.cwd(), "explore-output");

function shape(value: unknown, depth = 0): unknown {
  if (depth > 6) return "…";
  if (Array.isArray(value)) {
    return value.length === 0 ? "[] (empty array)" : [shape(value[0], depth + 1), `… ${value.length} item(s)`];
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, depth + 1)]));
  }
  if (value === null) return "null";
  return `${typeof value} (e.g. ${JSON.stringify(value).slice(0, 40)})`;
}

async function probe(label: string, file: string, p: string, params: Record<string, string | number> = {}) {
  process.stdout.write(`\n=== ${label}\n    GET ${p} ${JSON.stringify(params)}\n`);
  try {
    const data = await smartleadGet(p, params);
    fs.writeFileSync(path.join(OUT_DIR, `${file}.json`), JSON.stringify(data, null, 2));
    console.log(JSON.stringify(shape(data), null, 2));
    return data;
  } catch (e) {
    if (e instanceof SmartleadError) console.log(`    !! ${e.status}: ${e.body}`);
    else console.log(`    !! ${(e as Error).message}`);
    return undefined;
  }
}

function asArray(data: unknown, ...keys: string[]): any[] {
  if (Array.isArray(data)) return data;
  for (const k of keys) {
    const v = (data as any)?.[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const campaignsRaw = await probe("List campaigns", "campaigns", "/campaigns/");
  const campaigns = asArray(campaignsRaw, "campaigns", "data");
  console.log(`\n    -> ${campaigns.length} campaign(s); statuses: ${[...new Set(campaigns.map((c) => c.status))].join(", ") || "n/a"}`);

  await probe("Lead categories", "lead-categories", "/leads/fetch-categories");

  const accountsRaw = await probe("Email accounts (first 5)", "email-accounts", "/email-accounts/", { offset: 0, limit: 5 });
  const accounts = asArray(accountsRaw, "data", "email_accounts");
  if (accounts[0]?.id) {
    await probe("Warmup stats (first account)", "warmup-stats", `/email-accounts/${accounts[0].id}/warmup-stats`);
  }

  // Prefer campaigns that have actually been started.
  const started = campaigns.filter((c) => ["ACTIVE", "PAUSED", "STOPPED", "COMPLETED"].includes(c.status));
  const sample = (started.length ? started : campaigns).slice(0, 2);
  if (sample.length === 0) console.log("\n(No campaigns yet: campaign-level endpoints skipped. Re-run once a campaign exists, even a draft.)");

  const end = new Date();
  const start = new Date(end.getTime() - 6 * 86400_000);

  for (const c of sample) {
    const id = c.id;
    await probe(`Campaign ${id} analytics (cumulative)`, `campaign-${id}-analytics`, `/campaigns/${id}/analytics`);
    await probe(`Campaign ${id} analytics by date (last 7 days)`, `campaign-${id}-analytics-by-date`, `/campaigns/${id}/analytics-by-date`, {
      start_date: isoDate(start),
      end_date: isoDate(end),
      timezone: "Europe/London",
    });
    await probe(`Campaign ${id} leads (first 5)`, `campaign-${id}-leads`, `/campaigns/${id}/leads`, { offset: 0, limit: 5 });
    await probe(`Campaign ${id} replied leads (first 5)`, `campaign-${id}-leads-replied`, `/campaigns/${id}/leads`, {
      offset: 0,
      limit: 5,
      emailStatus: "is_replied",
    });
    await probe(`Campaign ${id} email-level statistics (first 5)`, `campaign-${id}-statistics`, `/campaigns/${id}/statistics`, {
      offset: 0,
      limit: 5,
    });
    await probe(`Campaign ${id} webhooks`, `campaign-${id}-webhooks`, `/campaigns/${id}/webhooks`);
  }

  console.log(`\nDone. ${getRequestCount()} API call(s). Raw responses in ${OUT_DIR}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
