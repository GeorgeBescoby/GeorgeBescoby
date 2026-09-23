import { KpiStrip } from "@/components/KpiStrip";
import { PageHead } from "@/components/PageHead";
import { TrendChart } from "@/components/TrendChart";
import { getDashboardContext } from "@/lib/data-source";
import { parsePeriodKey, resolvePeriod } from "@/lib/dates";
import { count, money2, pct } from "@/lib/format";
import { allTimeStart, computeKpis, computeWeeklyTrend } from "@/lib/metrics/compute";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: p } = await searchParams;
  const ctx = await getDashboardContext();
  const period = resolvePeriod(parsePeriodKey(p), ctx.today, allTimeStart(ctx.dataset, ctx.settings));
  const kpis = computeKpis(ctx.dataset, ctx.settings, period, ctx.today);
  const trend = computeWeeklyTrend(ctx.dataset, ctx.settings, ctx.today);

  return (
    <main>
      <PageHead title="Overview" period={period} basePath="/" />
      <p className="note">
        <strong>Customer = app install. CAC = spend ÷ installs.</strong> Spend is pro-rated daily from the monthly tool
        costs. Replies exclude out-of-office; a “Downloaded” lead also counts as a positive reply.
      </p>
      {ctx.mode === "live" && ctx.dataset.snapshots.length === 0 && (
        <p className="note banner">No Smartlead data yet. The daily job will fill this in, or press “Refresh now”.</p>
      )}

      <KpiStrip k={kpis} settings={ctx.settings} />

      <h2 className="section-title">Weekly trends</h2>
      <div className="charts">
        <TrendChart title="Downloads" sub="App installs per week" kind="count" bars data={trend.map((t) => ({ label: t.label, value: t.downloads }))} />
        <TrendChart title="CAC" sub="Spend ÷ downloads, per week" kind="money" data={trend.map((t) => ({ label: t.label, value: t.cac }))} />
        <TrendChart title="CPL" sub="Spend ÷ positive replies, per week" kind="money" data={trend.map((t) => ({ label: t.label, value: t.cpl }))} />
        <TrendChart
          title="Positive reply rate"
          sub="Positive replies ÷ prospects contacted, per week"
          kind="pct"
          data={trend.map((t) => ({ label: t.label, value: t.positiveReplyRate }))}
        />
      </div>
      <p className="meta" style={{ marginTop: 8 }}>
        Weeks run Monday–Sunday; the current week is to date. Weekly rates move around because a reply can come from a
        lead contacted the week before.
      </p>

      <details className="table-view">
        <summary>Show weekly numbers as a table</summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Week of</th>
                <th>Spend</th>
                <th>Prospects</th>
                <th>Positive replies</th>
                <th>Downloads</th>
                <th>Positive reply rate</th>
                <th>CPL</th>
                <th>CAC</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((t) => (
                <tr key={t.weekStart}>
                  <td>{t.label}</td>
                  <td>{money2(t.spend)}</td>
                  <td>{count(t.prospectsContacted)}</td>
                  <td>{count(t.positiveReplies)}</td>
                  <td>{count(t.downloads)}</td>
                  <td>{pct(t.positiveReplyRate)}</td>
                  <td>{money2(t.cpl)}</td>
                  <td>{money2(t.cac)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </main>
  );
}
