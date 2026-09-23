import type { Settings } from "@/config/defaults";
import { count, money, money2, pct } from "@/lib/format";
import type { Kpis } from "@/lib/metrics/types";
import { monthlyGbp } from "@/lib/spend";

type Tile = { label: string; value: string; sub?: React.ReactNode; headline?: boolean; alert?: boolean };

export function KpiStrip({ k, settings }: { k: Kpis; settings: Settings }) {
  const bounceHigh = k.bounceRate != null && k.bounceRate * 100 > settings.bounceAlertPct;
  const tiles: Tile[] = [
    { label: "Total spend", value: money(k.spend), sub: `${money(monthlyGbp(settings))}/month`, headline: true },
    { label: "Prospects contacted", value: count(k.prospectsContacted), sub: "Unique leads emailed" },
    { label: "Campaigns launched", value: count(k.campaignsLaunched), sub: `${count(k.campaignsLaunchedTotal)} in total` },
    { label: "Emails sent", value: count(k.emailsSent), sub: "All sequence steps" },
    { label: "Reply rate", value: pct(k.replyRate), sub: `${count(k.replies)} replies, excl. out-of-office` },
    {
      label: "Positive reply rate",
      value: pct(k.positiveReplyRate),
      sub: `${count(k.positiveReplies)} positive · ${pct(k.positiveShareOfReplies)} of replies`,
    },
    { label: "CPL", value: money2(k.cpl), sub: "Spend ÷ positive replies", headline: true },
    { label: "Downloads", value: count(k.downloads), sub: `${pct(k.replyToDownloadRate)} of positive replies`, headline: true },
    { label: "CAC", value: money2(k.cac), sub: "Spend ÷ downloads", headline: true },
    {
      label: "Bounce rate",
      value: pct(k.bounceRate),
      sub: bounceHigh ? (
        <span className="status-critical">▲ Above {settings.bounceAlertPct}%</span>
      ) : (
        `${count(k.bounced)} bounced`
      ),
      alert: bounceHigh,
    },
  ];
  return (
    <section className="kpis" aria-label="Key numbers">
      {tiles.map((t) => (
        <div key={t.label} className={`kpi${t.headline ? " headline" : ""}${t.alert ? " alert" : ""}`}>
          <div className="label">{t.label}</div>
          <div className="value">{t.value}</div>
          {t.sub && <div className="sub">{t.sub}</div>}
        </div>
      ))}
    </section>
  );
}
