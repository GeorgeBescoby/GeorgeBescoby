// All KPI maths lives here as pure functions over a Dataset, so the same code
// runs on mock and live data and can be unit-tested by hand.
//
// Definitions follow the brief exactly:
//   Reply rate          = unique leads who replied (excl. out-of-office) ÷ prospects contacted
//   Positive reply rate = positive replies ÷ prospects contacted
//   Bounce rate         = bounced emails ÷ emails sent
//   CPL                 = spend ÷ positive replies
//   CAC                 = spend ÷ downloads
//   Reply → download    = downloads ÷ positive replies
//
// Period attribution:
//   emails sent / prospects / bounces  -> difference between daily cumulative snapshots
//   replies                            -> day of the lead's first reply
//   positive replies                   -> first day the lead entered any positive category
//   downloads                          -> download date (webhook > download_date field > first snapshot)
import type { Settings } from "@/config/defaults";
import { addDays, formatDayShort, londonDay, maxDay, minDay, weeksInRange, type Day, type Period } from "@/lib/dates";
import { spendGbp } from "@/lib/spend";
import type { CampaignKpis, CampaignRow, CategoryEventRow, Counts, Dataset, Kpis, LeadRow, SnapshotRow, TrendPoint } from "./types";

const STARTED_STATUSES = new Set(["ACTIVE", "PAUSED", "STOPPED", "COMPLETED"]);

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

// ---------------------------------------------------------------- snapshots

type Cumulative = { sent: number; unique_sent: number; bounced: number };
const ZERO: Cumulative = { sent: 0, unique_sent: 0, bounced: 0 };

/** Snapshots grouped per campaign, sorted by day ascending. */
export function indexSnapshots(snapshots: SnapshotRow[]): Map<number, SnapshotRow[]> {
  const byCampaign = new Map<number, SnapshotRow[]>();
  for (const s of snapshots) {
    const list = byCampaign.get(s.campaign_id) ?? [];
    list.push(s);
    byCampaign.set(s.campaign_id, list);
  }
  for (const list of byCampaign.values()) list.sort((a, b) => (a.day < b.day ? -1 : 1));
  return byCampaign;
}

/** Cumulative totals as of the end of `day` (latest snapshot on or before it). */
export function cumulativeAt(list: SnapshotRow[] | undefined, day: Day): Cumulative {
  let found: Cumulative = ZERO;
  for (const s of list ?? []) {
    if (s.day > day) break;
    found = s;
  }
  return found;
}

export function snapshotDelta(list: SnapshotRow[] | undefined, start: Day, end: Day): Cumulative {
  const a = cumulativeAt(list, addDays(start, -1));
  const b = cumulativeAt(list, end);
  return {
    sent: Math.max(0, b.sent - a.sent),
    unique_sent: Math.max(0, b.unique_sent - a.unique_sent),
    bounced: Math.max(0, b.bounced - a.bounced),
  };
}

// ---------------------------------------------------------------- lead dates

export type LeadDates = {
  replyDay: Day | null; // null if never replied or reply was out-of-office
  positiveDay: Day | null;
  downloadDay: Day | null;
  downloadSource: "webhook" | "custom_field" | "snapshot" | null;
};

function toDay(ts: string | null | undefined): Day | null {
  if (!ts) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : londonDay(d);
}

/** Parse the free-text download_date custom field (YYYY-MM-DD, ISO, or DD/MM/YYYY). */
export function parseDownloadDateField(v: string | null | undefined): Day | null {
  if (!v) return null;
  const s = v.trim();
  const uk = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (uk) return `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  return toDay(s);
}

export function computeLeadDates(lead: LeadRow, events: CategoryEventRow[], settings: Settings): LeadDates {
  const ooo = new Set(settings.oooCategories.map(norm));
  const positive = new Set(settings.positiveCategories.map(norm));
  const downloadCat = norm(settings.downloadCategory);

  // First day per category, webhook timestamps preferred over snapshot days.
  const firstByCategory = new Map<string, { webhook?: Day; snapshot?: Day }>();
  for (const e of events) {
    const key = norm(e.category);
    const day = toDay(e.occurred_at);
    if (!day) continue;
    const entry = firstByCategory.get(key) ?? {};
    const prev = entry[e.source];
    if (!prev || day < prev) entry[e.source] = day;
    firstByCategory.set(key, entry);
  }
  // A lead currently in a category always has at least a snapshot-level record.
  const effectiveDay = (key: string): Day | null => {
    const e = firstByCategory.get(key);
    return e?.webhook ?? e?.snapshot ?? null;
  };

  // Download: webhook > download_date field > first snapshot.
  let downloadDay: Day | null = null;
  let downloadSource: LeadDates["downloadSource"] = null;
  const dl = firstByCategory.get(downloadCat);
  if (dl || norm(lead.category) === downloadCat) {
    const field = parseDownloadDateField(lead.download_date_field);
    if (dl?.webhook) [downloadDay, downloadSource] = [dl.webhook, "webhook"];
    else if (field) [downloadDay, downloadSource] = [field, "custom_field"];
    else if (dl?.snapshot) [downloadDay, downloadSource] = [dl.snapshot, "snapshot"];
  }

  // Positive: earliest entry into any positive category (Downloaded counts).
  let positiveDay: Day | null = null;
  for (const key of positive) {
    const d = key === downloadCat ? downloadDay : effectiveDay(key);
    if (d && (!positiveDay || d < positiveDay)) positiveDay = d;
  }

  // Reply: unique lead, excluded if their (latest) category is out-of-office.
  let replyDay: Day | null = null;
  if (lead.replied && !ooo.has(norm(lead.category))) {
    replyDay = toDay(lead.reply_at);
  }

  return { replyDay, positiveDay, downloadDay, downloadSource };
}

export type LeadWithDates = LeadRow & LeadDates;

export function annotateLeads(data: Dataset, settings: Settings): LeadWithDates[] {
  const eventsByLead = new Map<string, CategoryEventRow[]>();
  for (const e of data.categoryEvents) {
    const k = `${e.campaign_id}:${e.email}`;
    (eventsByLead.get(k) ?? eventsByLead.set(k, []).get(k)!).push(e);
  }
  return data.leads.map((l) => ({
    ...l,
    ...computeLeadDates(l, eventsByLead.get(`${l.campaign_id}:${l.email}`) ?? [], settings),
  }));
}

// ---------------------------------------------------------------- campaigns

/** First day a campaign had sends; null if it never sent. */
export function launchDay(c: CampaignRow, list: SnapshotRow[] | undefined): Day | null {
  const firstSend = (list ?? []).find((s) => s.sent > 0)?.day ?? null;
  if (firstSend) return firstSend;
  return STARTED_STATUSES.has(c.status) ? toDay(c.created_at) : null;
}

/** Launched = ever started (ACTIVE/PAUSED/STOPPED/COMPLETED), or ARCHIVED after sending. Drafts never count. */
export function isLaunched(c: CampaignRow, list: SnapshotRow[] | undefined): boolean {
  if (STARTED_STATUSES.has(c.status)) return true;
  if (c.status === "ARCHIVED") return (list ?? []).some((s) => s.sent > 0);
  return false;
}

// ---------------------------------------------------------------- aggregation

const inRange = (d: Day | null, start: Day, end: Day) => !!d && d >= start && d <= end;

function countsFor(
  campaignIds: Set<number>,
  snaps: Map<number, SnapshotRow[]>,
  leads: LeadWithDates[],
  start: Day,
  end: Day,
): Counts {
  const c: Counts = { emailsSent: 0, prospectsContacted: 0, bounced: 0, replies: 0, positiveReplies: 0, downloads: 0 };
  for (const id of campaignIds) {
    const d = snapshotDelta(snaps.get(id), start, end);
    c.emailsSent += d.sent;
    c.prospectsContacted += d.unique_sent;
    c.bounced += d.bounced;
  }
  for (const l of leads) {
    if (!campaignIds.has(l.campaign_id)) continue;
    if (inRange(l.replyDay, start, end)) c.replies++;
    if (inRange(l.positiveDay, start, end)) c.positiveReplies++;
    if (inRange(l.downloadDay, start, end)) c.downloads++;
  }
  return c;
}

/** Earliest date with data or costs; start of "All time". */
export function allTimeStart(data: Dataset, settings: Settings): Day {
  let start = settings.costStartDate;
  for (const s of data.snapshots) start = minDay(start, s.day);
  return start;
}

export function computeKpis(data: Dataset, settings: Settings, period: Period, todayDay: Day): Kpis {
  const snaps = indexSnapshots(data.snapshots);
  const leads = annotateLeads(data, settings);
  const ids = new Set(data.campaigns.map((c) => c.id));
  const counts = countsFor(ids, snaps, leads, period.start, period.end);
  const spend = spendGbp(settings, period.start, period.end, todayDay);

  const launched = data.campaigns.filter((c) => isLaunched(c, snaps.get(c.id)));
  const campaignsLaunched =
    period.key === "all_time"
      ? launched.length
      : launched.filter((c) => inRange(launchDay(c, snaps.get(c.id)), period.start, period.end)).length;

  return {
    ...counts,
    spend,
    campaignsLaunched,
    campaignsLaunchedTotal: launched.length,
    replyRate: ratio(counts.replies, counts.prospectsContacted),
    positiveReplyRate: ratio(counts.positiveReplies, counts.prospectsContacted),
    positiveShareOfReplies: ratio(counts.positiveReplies, counts.replies),
    bounceRate: ratio(counts.bounced, counts.emailsSent),
    cpl: ratio(spend, counts.positiveReplies),
    cac: ratio(spend, counts.downloads),
    replyToDownloadRate: ratio(counts.downloads, counts.positiveReplies),
  };
}

export function computeCampaignTable(data: Dataset, settings: Settings, period: Period, todayDay: Day): CampaignKpis[] {
  const snaps = indexSnapshots(data.snapshots);
  const leads = annotateLeads(data, settings);
  const spend = spendGbp(settings, period.start, period.end, todayDay);

  const launched = data.campaigns.filter((c) => isLaunched(c, snaps.get(c.id)));
  const rows = launched.map((c) => ({ c, counts: countsFor(new Set([c.id]), snaps, leads, period.start, period.end) }));
  const totalSent = rows.reduce((s, r) => s + r.counts.emailsSent, 0);

  return rows.map(({ c, counts }) => {
    const allocatedSpend = totalSent > 0 ? spend * (counts.emailsSent / totalSent) : 0;
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      ...counts,
      allocatedSpend,
      replyRate: ratio(counts.replies, counts.prospectsContacted),
      positiveReplyRate: ratio(counts.positiveReplies, counts.prospectsContacted),
      bounceRate: ratio(counts.bounced, counts.emailsSent),
      cpl: ratio(allocatedSpend, counts.positiveReplies),
      cac: ratio(allocatedSpend, counts.downloads),
    };
  });
}

/** Weekly (Mon–Sun) trend for the last `maxWeeks` weeks up to today. */
export function computeWeeklyTrend(data: Dataset, settings: Settings, todayDay: Day, maxWeeks = 12): TrendPoint[] {
  const snaps = indexSnapshots(data.snapshots);
  const leads = annotateLeads(data, settings);
  const ids = new Set(data.campaigns.map((c) => c.id));
  const first = maxDay(allTimeStart(data, settings), addDays(todayDay, -7 * (maxWeeks - 1)));

  return weeksInRange(first, todayDay).map((weekStart) => {
    const weekEnd = minDay(addDays(weekStart, 6), todayDay);
    const counts = countsFor(ids, snaps, leads, weekStart, weekEnd);
    const spend = spendGbp(settings, weekStart, weekEnd, todayDay);
    return {
      weekStart,
      label: formatDayShort(weekStart),
      spend,
      downloads: counts.downloads,
      positiveReplies: counts.positiveReplies,
      prospectsContacted: counts.prospectsContacted,
      cac: ratio(spend, counts.downloads),
      cpl: ratio(spend, counts.positiveReplies),
      positiveReplyRate: ratio(counts.positiveReplies, counts.prospectsContacted),
    };
  });
}
