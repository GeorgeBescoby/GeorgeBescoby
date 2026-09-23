// Browser entry for the claude.ai artifact version of the dashboard.
// Same KPI code as the Next.js app (lib/metrics); data comes from the
// artifact's database (written daily by a Claude routine) or from the
// built-in sample generator.
import { DEFAULT_SETTINGS, type Settings } from "@/config/defaults";
import { datasetFromDocs, type CampaignDoc, type LeadsDoc } from "@/lib/artifact-state";
import { addDays, formatDayShort, londonDay, parsePeriodKey, PERIODS, resolvePeriod, type Day, type PeriodKey } from "@/lib/dates";
import { count, money, money2, pct } from "@/lib/format";
import { allTimeStart, computeCampaignTable, computeKpis, computeWeeklyTrend } from "@/lib/metrics/compute";
import type { CampaignKpis, Dataset, Kpis, TrendPoint } from "@/lib/metrics/types";
import { generateMockData, MOCK_HISTORY_DAYS } from "@/lib/mock/data";
import { validateSettings } from "@/lib/settings";
import { monthlyGbp } from "@/lib/spend";

type Mode = "sample" | "live";
type Tab = "overview" | "campaigns" | "settings";
type SyncMeta = { status?: string; message?: string; finished_at?: string } | null;

const state = {
  tab: "overview" as Tab,
  period: "this_month" as PeriodKey,
  mode: "sample" as Mode,
  settings: structuredClone(DEFAULT_SETTINGS) as Settings,
  campaignDocs: [] as CampaignDoc[],
  leadDocs: [] as LeadsDoc[],
  sync: null as SyncMeta,
  db: null as any,
  dbState: "connecting" as "connecting" | "ready" | "absent",
  settingsLoaded: false,
  readOnly: false,
  sort: { key: "emailsSent" as keyof CampaignKpis, dir: -1 as 1 | -1 },
  flash: null as null | { ok?: string; error?: string },
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ------------------------------------------------------------------ data

let mockCache: { day: Day; data: Dataset } | null = null;
function sampleDataset(today: Day): Dataset {
  if (mockCache?.day === today) return mockCache.data;
  const m = generateMockData(today);
  const data: Dataset = {
    campaigns: m.campaigns,
    snapshots: m.snapshots,
    leads: m.leads.map((l) => ({ ...l, lead_id: null })),
    categoryEvents: m.events,
  };
  mockCache = { day: today, data };
  return data;
}

function context() {
  const today = londonDay();
  if (state.mode === "sample") {
    const settings = { ...state.settings, costStartDate: addDays(today, -MOCK_HISTORY_DAYS) };
    return { today, settings, data: sampleDataset(today) };
  }
  return { today, settings: state.settings, data: datasetFromDocs(state.campaignDocs, state.leadDocs) };
}

// ------------------------------------------------------------------ charts

type Kind = "count" | "money" | "pct";
const fmtKind = (kind: Kind, v: number | null, axis = false): string => {
  if (v == null || !isFinite(v)) return "—";
  if (kind === "money") return axis ? `£${Number.isInteger(v) ? v.toLocaleString("en-GB") : v.toFixed(1)}` : money2(v);
  if (kind === "pct") return axis ? `${(v * 100).toFixed(v * 100 < 10 ? 1 : 0)}%` : pct(v);
  return v.toLocaleString("en-GB");
};

/** Axis top as 4 equal "nice" steps (1, 2, 2.5, 5 × 10ⁿ). */
function niceMax(max: number, kind: Kind): number {
  if (max <= 0) return kind === "pct" ? 0.01 : kind === "count" ? 4 : 20;
  const raw = max / 4;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  let step = 10 * exp;
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= raw) { step = m * exp; break; }
  if (kind === "count") step = Math.max(1, Math.ceil(step));
  if (kind === "money") step = Math.max(1, step);
  return step * 4;
}

function chart(id: string, title: string, sub: string, kind: Kind, points: { label: string; value: number | null }[], bars: boolean) {
  const W = 560, H = 200, L = 52, R = 12, T = 12, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const vals = points.map((p) => p.value).filter((v): v is number => v != null && isFinite(v));
  const top = niceMax(Math.max(0, ...vals), kind);
  const y = (v: number) => T + ph - (v / top) * ph;
  const band = pw / Math.max(1, points.length);
  const cx = (i: number) => L + band * i + band / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const every = points.length > 8 ? 2 : 1;

  let g = "";
  for (const t of ticks) {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/>`;
    g += `<text x="${L - 8}" y="${y(t) + 4}" class="tick" text-anchor="end">${esc(fmtKind(kind, t, true))}</text>`;
  }
  points.forEach((p, i) => {
    if (i % every === 0 || i === points.length - 1) {
      g += `<text x="${cx(i)}" y="${H - 6}" class="tick" text-anchor="middle">${esc(p.label)}</text>`;
    }
  });
  g += `<line x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}" class="axis"/>`;

  if (bars) {
    const bw = Math.min(24, band * 0.6);
    points.forEach((p, i) => {
      if (!p.value) return;
      const h = Math.max(1, (p.value / top) * ph), x = cx(i) - bw / 2, y0 = T + ph - h, r = Math.min(4, h);
      g += `<path class="bar" d="M${x},${T + ph} V${y0 + r} Q${x},${y0} ${x + r},${y0} H${x + bw - r} Q${x + bw},${y0} ${x + bw},${y0 + r} V${T + ph} Z"/>`;
    });
  } else {
    let d = "";
    let pen = false;
    points.forEach((p, i) => {
      if (p.value == null || !isFinite(p.value)) return void (pen = false);
      d += `${pen ? "L" : "M"}${cx(i)},${y(p.value)} `;
      pen = true;
    });
    g += `<path class="line" d="${d}"/>`;
    points.forEach((p, i) => {
      if (p.value != null && isFinite(p.value)) g += `<circle class="dot" cx="${cx(i)}" cy="${y(p.value)}" r="4"/>`;
    });
  }
  g += `<line class="cross" x1="0" x2="0" y1="${T}" y2="${T + ph}" visibility="hidden"/>`;
  points.forEach((p, i) => {
    g += `<rect class="hit" x="${L + band * i}" y="${T}" width="${band}" height="${ph}" data-i="${i}" data-x="${cx(i)}" data-label="${esc(p.label)}" data-value="${esc(fmtKind(kind, p.value))}" tabindex="0" aria-label="Week of ${esc(p.label)}: ${esc(fmtKind(kind, p.value))}"/>`;
  });

  return `<figure class="chart" id="${id}">
    <figcaption><strong>${esc(title)}</strong><span>${esc(sub)}</span></figcaption>
    <div class="plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)} by week" data-bars="${bars ? 1 : 0}">${g}</svg>
    <div class="tip" hidden></div></div>
  </figure>`;
}

// ------------------------------------------------------------------ views

function periodToggle() {
  return `<div class="seg" role="group" aria-label="Period">${PERIODS.map(
    (p) => `<button type="button" data-period="${p.key}" aria-pressed="${p.key === state.period}">${p.label}</button>`,
  ).join("")}</div>`;
}

function heading(title: string, sub: string, withPeriod: boolean) {
  return `<div class="head"><div><h1>${esc(title)}</h1><p class="range">${esc(sub)}</p></div>${withPeriod ? periodToggle() : ""}</div>`;
}

function rangeLabel(start: Day, end: Day, label: string) {
  return `${label}: ${formatDayShort(start)} – ${formatDayShort(end)} ${end.slice(0, 4)}`;
}

function kpiTiles(k: Kpis, s: Settings) {
  const bounceHigh = k.bounceRate != null && k.bounceRate * 100 > s.bounceAlertPct;
  const tiles: { label: string; value: string; sub: string; key?: boolean; alert?: boolean }[] = [
    { label: "Total spend", value: money(k.spend), sub: `${money(monthlyGbp(s))} a month`, key: true },
    { label: "Prospects contacted", value: count(k.prospectsContacted), sub: "Unique leads emailed" },
    { label: "Campaigns launched", value: count(k.campaignsLaunched), sub: `${count(k.campaignsLaunchedTotal)} in total` },
    { label: "Emails sent", value: count(k.emailsSent), sub: "All sequence steps" },
    { label: "Reply rate", value: pct(k.replyRate), sub: `${count(k.replies)} replies, excl. out-of-office` },
    { label: "Positive reply rate", value: pct(k.positiveReplyRate), sub: `${count(k.positiveReplies)} positive · ${pct(k.positiveShareOfReplies)} of replies` },
    { label: "CPL", value: money2(k.cpl), sub: "Spend ÷ positive replies", key: true },
    { label: "Downloads", value: count(k.downloads), sub: `${pct(k.replyToDownloadRate)} of positive replies`, key: true },
    { label: "CAC", value: money2(k.cac), sub: "Spend ÷ downloads", key: true },
    {
      label: "Bounce rate",
      value: pct(k.bounceRate),
      sub: bounceHigh ? `▲ Above ${s.bounceAlertPct}%` : `${count(k.bounced)} bounced`,
      alert: bounceHigh,
    },
  ];
  return `<section class="kpis" aria-label="Key numbers">${tiles
    .map(
      (t) => `<div class="kpi${t.key ? " key" : ""}${t.alert ? " alert" : ""}"><div class="k-label">${t.label}</div>
      <div class="k-value">${t.value}</div><div class="k-sub">${esc(t.sub)}</div></div>`,
    )
    .join("")}</section>`;
}

function trendTable(trend: TrendPoint[]) {
  return `<details class="tableview"><summary>Show weekly numbers as a table</summary><div class="tablewrap"><table>
    <thead><tr><th>Week of</th><th>Spend</th><th>Prospects</th><th>Positive replies</th><th>Downloads</th><th>Positive rate</th><th>CPL</th><th>CAC</th></tr></thead>
    <tbody>${trend
      .map(
        (t) => `<tr><td>${t.label}</td><td>${money2(t.spend)}</td><td>${count(t.prospectsContacted)}</td><td>${count(t.positiveReplies)}</td>
        <td>${count(t.downloads)}</td><td>${pct(t.positiveReplyRate)}</td><td>${money2(t.cpl)}</td><td>${money2(t.cac)}</td></tr>`,
      )
      .join("")}</tbody></table></div></details>`;
}

function emptyLiveNote() {
  if (state.mode !== "live" || state.campaignDocs.length) return "";
  return `<p class="note warn">No Smartlead data yet. It appears after the daily sync has run once.</p>`;
}

function overview() {
  const { today, settings, data } = context();
  const period = resolvePeriod(state.period, today, allTimeStart(data, settings));
  const k = computeKpis(data, settings, period, today);
  const trend = computeWeeklyTrend(data, settings, today);
  const pts = (f: (t: TrendPoint) => number | null) => trend.map((t) => ({ label: t.label, value: f(t) }));
  return `${heading("Overview", rangeLabel(period.start, period.end, period.label), true)}
    <p class="note"><strong>Customer = app install. CAC = spend ÷ installs.</strong> Spend is the monthly tool cost pro-rated by day. Replies exclude out-of-office; a “Downloaded” lead also counts as a positive reply.</p>
    ${emptyLiveNote()}
    ${kpiTiles(k, settings)}
    <h2>Weekly trends</h2>
    <div class="charts">
      ${chart("c-dl", "Downloads", "App installs per week", "count", pts((t) => t.downloads), true)}
      ${chart("c-cac", "CAC", "Spend ÷ downloads", "money", pts((t) => t.cac), false)}
      ${chart("c-cpl", "CPL", "Spend ÷ positive replies", "money", pts((t) => t.cpl), false)}
      ${chart("c-prr", "Positive reply rate", "Positive replies ÷ prospects contacted", "pct", pts((t) => t.positiveReplyRate), false)}
    </div>
    <p class="fine">Weeks run Monday–Sunday; this week is to date. Weekly rates move around because a reply can come from someone emailed the week before.</p>
    ${trendTable(trend)}`;
}

const COLS: { key: keyof CampaignKpis; label: string; f: (v: any) => string; total: (k: Kpis) => string }[] = [
  { key: "prospectsContacted", label: "Prospects", f: count, total: (k) => count(k.prospectsContacted) },
  { key: "emailsSent", label: "Emails sent", f: count, total: (k) => count(k.emailsSent) },
  { key: "replyRate", label: "Reply rate", f: pct, total: (k) => pct(k.replyRate) },
  { key: "positiveReplyRate", label: "Positive rate", f: pct, total: (k) => pct(k.positiveReplyRate) },
  { key: "bounceRate", label: "Bounce rate", f: pct, total: (k) => pct(k.bounceRate) },
  { key: "positiveReplies", label: "Positive replies", f: count, total: (k) => count(k.positiveReplies) },
  { key: "downloads", label: "Downloads", f: count, total: (k) => count(k.downloads) },
  { key: "allocatedSpend", label: "Allocated spend", f: money, total: (k) => money(k.spend) },
  { key: "cpl", label: "CPL", f: money2, total: (k) => money2(k.cpl) },
  { key: "cac", label: "CAC", f: money2, total: (k) => money2(k.cac) },
];

function campaigns() {
  const { today, settings, data } = context();
  const period = resolvePeriod(state.period, today, allTimeStart(data, settings));
  const rows = computeCampaignTable(data, settings, period, today);
  const totals = computeKpis(data, settings, period, today);
  const { key, dir } = state.sort;
  rows.sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return typeof av === "string" ? String(av).localeCompare(String(bv)) * dir : ((av as number) - (bv as number)) * dir;
  });
  const bad = (r: number | null) => r != null && r * 100 > settings.bounceAlertPct;
  const th = (k: keyof CampaignKpis, label: string) =>
    `<th aria-sort="${key === k ? (dir === 1 ? "ascending" : "descending") : "none"}"><button type="button" data-sort="${k}">${label}${key === k ? (dir === 1 ? " ↑" : " ↓") : ""}</button></th>`;
  const table = rows.length
    ? `<div class="tablewrap"><table class="camp"><thead><tr>${th("name", "Campaign")}${COLS.map((c) => th(c.key, c.label)).join("")}</tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr><td><span class="cname">${esc(r.name)}</span><span class="cstatus">${esc(r.status.toLowerCase())}</span></td>${COLS.map((c) =>
            c.key === "bounceRate" && bad(r.bounceRate)
              ? `<td class="bad" title="Above ${settings.bounceAlertPct}%">▲ ${pct(r.bounceRate)}</td>`
              : `<td>${c.f(r[c.key])}</td>`,
          ).join("")}</tr>`,
        )
        .join("")}</tbody>
      <tfoot><tr><td>All campaigns</td>${COLS.map((c) =>
        c.key === "bounceRate" && bad(totals.bounceRate) ? `<td class="bad">▲ ${pct(totals.bounceRate)}</td>` : `<td>${c.total(totals)}</td>`,
      ).join("")}</tr></tfoot></table></div>`
    : `<p class="note">No launched campaigns yet.</p>`;
  return `${heading("Campaigns", rangeLabel(period.start, period.end, period.label), true)}
    <p class="note"><strong>Allocated spend</strong> = the period’s spend × the campaign’s share of emails sent. Campaign CPL and CAC use it. Bounce rates above ${settings.bounceAlertPct}% are marked ▲ in red. Click a column to sort.</p>
    ${emptyLiveNote()}${table}`;
}

function settingsView() {
  const s = state.settings;
  const ro = state.readOnly || state.dbState !== "ready";
  const dis = ro ? "disabled" : "";
  const totalUsd = s.costs.reduce((a, c) => a + c.usdPerMonth, 0);
  const syncLine = state.sync?.finished_at
    ? `Last sync: ${esc(state.sync.status)} · ${new Date(state.sync.finished_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · ${esc(state.sync.message ?? "")}`
    : "The daily sync hasn’t run yet.";
  return `${heading("Settings", "Costs and definitions used by every view.", false)}
    ${state.dbState === "absent" ? `<p class="note warn">Settings can’t be saved in this view. Open the page on claude.ai to edit them.</p>` : ""}
    ${state.readOnly ? `<p class="note">You can view these settings but not change them.</p>` : ""}
    <form id="settings-form" autocomplete="off">
      <section class="panel">
        <h2>Data source</h2>
        <p class="help">Sample data shows the dashboard before campaigns go live. Live data is written by the daily Smartlead sync. In sample mode, costs start ${MOCK_HISTORY_DAYS} days ago so the numbers mean something; your cost start date isn’t changed.</p>
        <div class="radio">
          <label><input type="radio" name="dataMode" id="mode-sample" value="sample" ${state.mode === "sample" ? "checked" : ""} ${dis}> Sample data</label>
          <label><input type="radio" name="dataMode" id="mode-live" value="live" ${state.mode === "live" ? "checked" : ""} ${dis}> Live Smartlead data</label>
        </div>
        <p class="fine">${syncLine}</p>
      </section>
      <section class="panel">
        <h2>Monthly costs</h2>
        <p class="help">USD a month. Costs on other billing cycles are converted to a monthly figure (every 4 weeks × 13 ÷ 12). Spend for any period is pro-rated by day.</p>
        <div class="tablewrap"><table class="costs"><thead><tr><th>Item</th><th>Basis</th><th>USD / month</th><th>GBP / month</th></tr></thead><tbody>
        ${s.costs
          .map(
            (c, i) => `<tr><td><input type="text" id="cost-label-${i}" name="cost_label_${i}" value="${esc(c.label)}" aria-label="Item" ${dis}></td>
            <td><input type="text" id="cost-basis-${i}" name="cost_basis_${i}" value="${esc(c.basis)}" aria-label="Basis" ${dis}></td>
            <td><input type="number" step="0.01" min="0" id="cost-usd-${i}" name="cost_usd_${i}" value="${c.usdPerMonth}" aria-label="USD per month" ${dis}></td>
            <td class="num">${money2(c.usdPerMonth * s.usdToGbp)}</td></tr>`,
          )
          .join("")}
        <tr><td><input type="text" id="cost-label-new" name="cost_label_${s.costs.length}" placeholder="Add a cost…" aria-label="New item" ${dis}></td>
            <td><input type="text" id="cost-basis-new" name="cost_basis_${s.costs.length}" placeholder="Basis" aria-label="New basis" ${dis}></td>
            <td><input type="number" step="0.01" min="0" id="cost-usd-new" name="cost_usd_${s.costs.length}" aria-label="New USD per month" ${dis}></td><td></td></tr>
        </tbody><tfoot><tr><td>Total</td><td></td><td class="num">$${totalUsd.toFixed(2)}</td><td class="num">${money2(totalUsd * s.usdToGbp)}</td></tr></tfoot></table></div>
        <p class="fine">To remove a cost, clear its name and amount, then save.</p>
      </section>
      <section class="panel">
        <h2>Currency, dates and definitions</h2>
        <div class="fields">
          <label>USD → GBP rate<input type="number" step="0.0001" min="0" id="fx" name="usdToGbp" value="${s.usdToGbp}" ${dis}></label>
          <label>Cost start date<input type="date" id="cost-start" name="costStartDate" value="${esc(s.costStartDate)}" ${dis}></label>
          <label>Bounce rate alert above (%)<input type="number" step="0.1" min="0" id="bounce" name="bounceAlertPct" value="${s.bounceAlertPct}" ${dis}></label>
          <label class="wide">Positive categories (comma-separated)<input type="text" id="positive" name="positiveCategories" value="${esc(s.positiveCategories.join(", "))}" ${dis}></label>
          <label>Download category<input type="text" id="download" name="downloadCategory" value="${esc(s.downloadCategory)}" ${dis}></label>
          <label>Out-of-office categories<input type="text" id="ooo" name="oooCategories" value="${esc(s.oooCategories.join(", "))}" ${dis}></label>
        </div>
        <p class="fine">Category names must match Smartlead (case doesn’t matter).</p>
      </section>
      <div class="actions">
        <button type="submit" class="primary" ${dis}>Save settings</button>
        <button type="button" id="reset" ${dis}>Reset to defaults</button>
        ${state.flash?.ok ? `<span class="ok" role="status">✓ ${esc(state.flash.ok)}</span>` : ""}
        ${state.flash?.error ? `<span class="err" role="alert">${esc(state.flash.error)}</span>` : ""}
      </div>
    </form>`;
}

// ------------------------------------------------------------------ shell

function render() {
  const app = document.getElementById("app")!;
  const scrollY = window.scrollY;
  const badge =
    state.mode === "sample"
      ? `<span class="badge sample" title="Generated example numbers, not your campaigns">Sample data</span>`
      : `<span class="badge live">Live data${state.sync?.finished_at ? ` · synced ${new Date(state.sync.finished_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span>`;
  const tabs: [Tab, string][] = [["overview", "Overview"], ["campaigns", "Campaigns"], ["settings", "Settings"]];
  app.innerHTML = `<header class="top"><div class="wrap">
      <div class="brand"><b>ASK</b><strong>BOSCO</strong></div>
      <span class="brand-sub">Cold email economics</span>
      <nav class="tabs" aria-label="Sections">${tabs.map(([t, l]) => `<a href="#${t}" aria-current="${state.tab === t ? "page" : "false"}">${l}</a>`).join("")}</nav>
      ${badge}
    </div></header>
    <main class="wrap">${state.tab === "overview" ? overview() : state.tab === "campaigns" ? campaigns() : settingsView()}</main>`;
  window.scrollTo(0, scrollY);
}

function wireCharts(root: HTMLElement) {
  const show = (hit: SVGRectElement) => {
    const fig = hit.closest(".chart")!;
    const svg = fig.querySelector("svg")!;
    const tip = fig.querySelector<HTMLElement>(".tip")!;
    const cross = svg.querySelector<SVGLineElement>(".cross")!;
    const x = Number(hit.dataset.x);
    if (svg.dataset.bars === "0") {
      cross.setAttribute("x1", String(x));
      cross.setAttribute("x2", String(x));
      cross.setAttribute("visibility", "visible");
    }
    svg.querySelectorAll(".hit.on").forEach((h) => h.classList.remove("on"));
    hit.classList.add("on");
    tip.innerHTML = `<span>Week of ${esc(hit.dataset.label)}</span><strong>${esc(hit.dataset.value)}</strong>`;
    tip.hidden = false;
    const box = svg.getBoundingClientRect();
    const px = (x / 560) * box.width;
    tip.style.left = `${Math.min(Math.max(px, 60), box.width - 60)}px`;
  };
  const hide = (fig: Element) => {
    fig.querySelector<HTMLElement>(".tip")!.hidden = true;
    fig.querySelector(".cross")?.setAttribute("visibility", "hidden");
    fig.querySelectorAll(".hit.on").forEach((h) => h.classList.remove("on"));
  };
  root.addEventListener("pointerover", (e) => {
    const hit = (e.target as Element).closest?.(".hit");
    if (hit) show(hit as SVGRectElement);
  });
  root.addEventListener("focusin", (e) => {
    const hit = (e.target as Element).closest?.(".hit");
    if (hit) show(hit as SVGRectElement);
  });
  root.addEventListener("pointerout", (e) => {
    const fig = (e.target as Element).closest?.(".chart");
    const to = (e as PointerEvent).relatedTarget as Element | null;
    if (fig && !fig.contains(to)) hide(fig);
  });
  root.addEventListener("focusout", (e) => {
    const fig = (e.target as Element).closest?.(".chart");
    if (fig) hide(fig);
  });
}

function readForm(form: HTMLFormElement): Settings {
  const fd = new FormData(form);
  const list = (k: string) => String(fd.get(k) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const costs = [];
  for (let i = 0; fd.has(`cost_label_${i}`); i++) {
    const label = String(fd.get(`cost_label_${i}`) ?? "").trim();
    const usd = String(fd.get(`cost_usd_${i}`) ?? "").trim();
    if (!label && !usd) continue;
    const prev = state.settings.costs[i];
    costs.push({
      key: prev?.key || label.toLowerCase().replace(/\W+/g, "_"),
      label,
      basis: String(fd.get(`cost_basis_${i}`) ?? "").trim(),
      usdPerMonth: Number(usd),
    });
  }
  const s: Settings = {
    ...state.settings,
    costs,
    usdToGbp: Number(fd.get("usdToGbp")),
    costStartDate: String(fd.get("costStartDate") ?? ""),
    bounceAlertPct: Number(fd.get("bounceAlertPct")),
    positiveCategories: list("positiveCategories"),
    downloadCategory: String(fd.get("downloadCategory") ?? "").trim(),
    oooCategories: list("oooCategories"),
  };
  if (s.downloadCategory && !s.positiveCategories.some((c) => c.toLowerCase() === s.downloadCategory.toLowerCase())) {
    s.positiveCategories.push(s.downloadCategory);
  }
  return s;
}

async function saveSettingsDoc(settings: Settings, mode: Mode, okMessage: string) {
  if (!state.db) return;
  try {
    await state.db.doc("settings/main").set({ settings, dataMode: mode });
    state.settings = settings;
    state.mode = mode;
    state.flash = { ok: okMessage };
  } catch (e: any) {
    if (e?.code === "invalid_argument") state.readOnly = true;
    state.flash = { error: e?.code === "invalid_argument" ? "You don’t have permission to change settings." : "Couldn’t save. Try again in a moment." };
  }
  render();
}

function wire() {
  const root = document.getElementById("app")!;
  wireCharts(root);
  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const p = t.closest<HTMLElement>("[data-period]");
    if (p) {
      state.period = parsePeriodKey(p.dataset.period);
      try { localStorage.setItem("ced-period", state.period); } catch { /* storage unavailable */ }
      return render();
    }
    const s = t.closest<HTMLElement>("[data-sort]");
    if (s) {
      const key = s.dataset.sort as keyof CampaignKpis;
      state.sort = { key, dir: state.sort.key === key ? (state.sort.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 };
      return render();
    }
    if (t.id === "reset") {
      void saveSettingsDoc(structuredClone(DEFAULT_SETTINGS), state.mode, "Settings reset to the defaults.");
    }
  });
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "dataMode") void saveSettingsDoc(state.settings, t.value === "live" ? "live" : "sample", t.value === "live" ? "Showing live data." : "Showing sample data.");
  });
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = validateSettings(readForm(e.target as HTMLFormElement));
    if (!v.ok) {
      state.flash = { error: v.error };
      return render();
    }
    void saveSettingsDoc(v.settings, state.mode, "Settings saved.");
  });
  const onHash = () => {
    const h = location.hash.replace("#", "");
    state.tab = h === "campaigns" || h === "settings" ? h : "overview";
    state.flash = null;
    render();
  };
  window.addEventListener("hashchange", onHash);
  onHash();
}

async function connect() {
  const claude = (window as any).claude;
  const db = claude?.use ? await claude.use("db").catch(() => null) : null;
  if (!db) {
    state.dbState = "absent";
    return render();
  }
  state.db = db;
  state.dbState = "ready";
  const onErr = () => {};
  db.doc("settings/main").onSnapshot((snap: any) => {
    const d = snap.exists ? snap.data() : null;
    state.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(d?.settings ?? {}) };
    state.mode = d?.dataMode === "live" ? "live" : "sample";
    state.settingsLoaded = true;
    if (!(document.activeElement && document.activeElement.closest("#settings-form"))) render();
  }, onErr);
  db.doc("meta/sync").onSnapshot((snap: any) => {
    state.sync = snap.exists ? snap.data() : null;
    render();
  }, onErr);
  db.collection("campaigns").onSnapshot((q: any) => {
    state.campaignDocs = q.docs.map((d: any) => d.data());
    render();
  }, onErr);
  db.collection("leads").onSnapshot((q: any) => {
    state.leadDocs = q.docs.map((d: any) => d.data());
    render();
  }, onErr);
  const user = await claude.use("user").catch(() => null);
  if (user && user.can && (await user.can("data.write")) === false) {
    state.readOnly = true;
    render();
  }
}

try {
  const p = localStorage.getItem("ced-period");
  if (p) state.period = parsePeriodKey(p);
} catch { /* storage unavailable */ }
wire();
void connect();
