"use client";

import { useMemo, useState } from "react";
import { count, money, money2, pct } from "@/lib/format";
import type { CampaignKpis, Kpis } from "@/lib/metrics/types";

type Col = {
  key: keyof CampaignKpis;
  label: string;
  render: (r: CampaignKpis) => string;
  total: (k: Kpis) => string;
};

const COLUMNS: Col[] = [
  { key: "prospectsContacted", label: "Prospects", render: (r) => count(r.prospectsContacted), total: (k) => count(k.prospectsContacted) },
  { key: "emailsSent", label: "Emails sent", render: (r) => count(r.emailsSent), total: (k) => count(k.emailsSent) },
  { key: "replyRate", label: "Reply rate", render: (r) => pct(r.replyRate), total: (k) => pct(k.replyRate) },
  { key: "positiveReplyRate", label: "Positive rate", render: (r) => pct(r.positiveReplyRate), total: (k) => pct(k.positiveReplyRate) },
  { key: "bounceRate", label: "Bounce rate", render: (r) => pct(r.bounceRate), total: (k) => pct(k.bounceRate) },
  { key: "positiveReplies", label: "Positive replies", render: (r) => count(r.positiveReplies), total: (k) => count(k.positiveReplies) },
  { key: "downloads", label: "Downloads", render: (r) => count(r.downloads), total: (k) => count(k.downloads) },
  { key: "allocatedSpend", label: "Allocated spend", render: (r) => money(r.allocatedSpend), total: (k) => money(k.spend) },
  { key: "cpl", label: "CPL", render: (r) => money2(r.cpl), total: (k) => money2(k.cpl) },
  { key: "cac", label: "CAC", render: (r) => money2(r.cac), total: (k) => money2(k.cac) },
];

export function CampaignTable({ rows, totals, bounceAlertPct }: { rows: CampaignKpis[]; totals: Kpis; bounceAlertPct: number }) {
  const [sort, setSort] = useState<{ key: keyof CampaignKpis; dir: 1 | -1 }>({ key: "emailsSent", dir: -1 });

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      // Blank values (—) always sink to the bottom.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * sort.dir;
      return ((av as number) - (bv as number)) * sort.dir;
    });
  }, [rows, sort]);

  const header = (key: keyof CampaignKpis, label: string) => {
    const active = sort.key === key;
    return (
      <th key={key} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => setSort({ key, dir: active ? (sort.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 })}>
          {label} {active ? (sort.dir === 1 ? "↑" : "↓") : ""}
        </button>
      </th>
    );
  };

  const isBad = (r: { bounceRate: number | null }) => r.bounceRate != null && r.bounceRate * 100 > bounceAlertPct;

  if (rows.length === 0) return <p className="note">No launched campaigns yet.</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {header("name", "Campaign")}
            {COLUMNS.map((c) => header(c.key, c.label))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              <td>
                <span className="campaign-name">{r.name}</span>
                <span className="status-pill">{r.status.toLowerCase()}</span>
              </td>
              {COLUMNS.map((c) => (
                <td
                  key={c.key}
                  className={c.key === "bounceRate" && isBad(r) ? "bad" : undefined}
                  title={c.key === "bounceRate" && isBad(r) ? `Above ${bounceAlertPct}%` : undefined}
                >
                  {c.key === "bounceRate" && isBad(r) ? "▲ " : ""}
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>All campaigns</td>
            {COLUMNS.map((c) => (
              <td key={c.key} className={c.key === "bounceRate" && isBad(totals) ? "bad" : undefined}>
                {c.key === "bounceRate" && isBad(totals) ? "▲ " : ""}
                {c.total(totals)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
