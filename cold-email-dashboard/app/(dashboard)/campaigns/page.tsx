import { CampaignTable } from "@/components/CampaignTable";
import { PageHead } from "@/components/PageHead";
import { getDashboardContext } from "@/lib/data-source";
import { parsePeriodKey, resolvePeriod } from "@/lib/dates";
import { allTimeStart, computeCampaignTable, computeKpis } from "@/lib/metrics/compute";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: p } = await searchParams;
  const ctx = await getDashboardContext();
  const period = resolvePeriod(parsePeriodKey(p), ctx.today, allTimeStart(ctx.dataset, ctx.settings));
  const rows = computeCampaignTable(ctx.dataset, ctx.settings, period, ctx.today);
  const totals = computeKpis(ctx.dataset, ctx.settings, period, ctx.today);

  return (
    <main>
      <PageHead title="Campaigns" period={period} basePath="/campaigns" />
      <p className="note">
        <strong>Allocated spend</strong> = total spend for the period × the campaign’s share of emails sent. Campaign CPL
        and CAC use allocated spend. Bounce rates above {ctx.settings.bounceAlertPct}% are marked ▲ in red. Click a column
        to sort.
      </p>
      <CampaignTable rows={rows} totals={totals} bounceAlertPct={ctx.settings.bounceAlertPct} />
    </main>
  );
}
