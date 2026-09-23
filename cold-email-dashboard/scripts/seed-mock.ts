/** Print a summary of the mock dataset and its KPIs for every period. Usage: npm run seed:mock */
import { createMemoryDb } from "../lib/db";
import { seedMockDb, MOCK_HISTORY_DAYS } from "../lib/mock/generate";
import { loadDataset } from "../lib/repository";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { PERIODS, resolvePeriod, today, addDays } from "../lib/dates";
import { allTimeStart, computeKpis, computeCampaignTable } from "../lib/metrics/compute";

async function main() {
  const t = today();
  const db = await createMemoryDb();
  const raw = await seedMockDb(db, t);
  const data = await loadDataset(db);
  const settings = { ...DEFAULT_SETTINGS, costStartDate: addDays(t, -MOCK_HISTORY_DAYS) };
  console.log(`today=${t} costStart=${settings.costStartDate} campaigns=${raw.campaigns.length} snapshots=${raw.snapshots.length} leads=${raw.leads.length} events=${raw.events.length}`);
  for (const p of PERIODS) {
    const period = resolvePeriod(p.key, t, allTimeStart(data, settings));
    console.log(`\n${p.label} ${period.start}..${period.end}`, computeKpis(data, settings, period, t));
  }
  const period = resolvePeriod("all_time", t, allTimeStart(data, settings));
  console.table(computeCampaignTable(data, settings, period, t).map((r) => ({ name: r.name, sent: r.emailsSent, bounce: r.bounceRate?.toFixed(3), pos: r.positiveReplies, dl: r.downloads, spend: r.allocatedSpend.toFixed(2) })));
}
main();
