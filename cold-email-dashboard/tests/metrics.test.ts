import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "@/config/defaults";
import { resolvePeriod, startOfWeek } from "@/lib/dates";
import { computeCampaignTable, computeKpis, computeLeadDates, snapshotDelta } from "@/lib/metrics/compute";
import type { Dataset, LeadRow } from "@/lib/metrics/types";
import { monthlyGbp, spendGbp } from "@/lib/spend";

const S: Settings = { ...DEFAULT_SETTINGS, costStartDate: "2026-09-01" };

describe("spend", () => {
  it("monthly total is $568.66 = £426.495", () => {
    expect(monthlyGbp(DEFAULT_SETTINGS)).toBeCloseTo(426.495, 6);
  });
  it("pro-rates by day and splits across months", () => {
    // 1–30 Sept = full September
    expect(spendGbp(S, "2026-09-01", "2026-09-30", "2026-12-31")).toBeCloseTo(426.495, 6);
    // 29 Sep – 2 Oct: 2/30 of Sept + 2/31 of Oct
    expect(spendGbp(S, "2026-09-29", "2026-10-02", "2026-12-31")).toBeCloseTo(426.495 * (2 / 30) + 426.495 * (2 / 31), 6);
  });
  it("never accrues before cost start or after today", () => {
    expect(spendGbp(S, "2026-08-01", "2026-08-31", "2026-12-31")).toBe(0);
    expect(spendGbp(S, "2026-09-01", "2026-09-30", "2026-09-10")).toBeCloseTo(426.495 * (10 / 30), 6);
  });
});

describe("periods", () => {
  it("weeks start on Monday", () => {
    expect(startOfWeek("2026-09-23")).toBe("2026-09-21"); // Wed -> Mon
    expect(startOfWeek("2026-09-27")).toBe("2026-09-21"); // Sun -> Mon
  });
  it("resolves last month", () => {
    expect(resolvePeriod("last_month", "2026-09-23", "2026-01-01")).toMatchObject({ start: "2026-08-01", end: "2026-08-31" });
  });
});

describe("snapshot differences", () => {
  const list = [
    { campaign_id: 1, day: "2026-09-02", sent: 100, unique_sent: 80, bounced: 2 },
    { campaign_id: 1, day: "2026-09-05", sent: 300, unique_sent: 200, bounced: 5 },
    { campaign_id: 1, day: "2026-09-09", sent: 450, unique_sent: 260, bounced: 9 },
  ];
  it("uses the latest snapshot on/before each boundary", () => {
    // before 2026-09-04 -> snapshot of 09-02; end 09-08 -> snapshot of 09-05
    expect(snapshotDelta(list, "2026-09-04", "2026-09-08")).toEqual({ sent: 200, unique_sent: 120, bounced: 3 });
  });
  it("treats no earlier snapshot as zero", () => {
    expect(snapshotDelta(list, "2026-09-01", "2026-09-30")).toEqual({ sent: 450, unique_sent: 260, bounced: 9 });
  });
});

const lead = (over: Partial<LeadRow>): LeadRow => ({
  campaign_id: 1,
  email: "a@x.com",
  lead_id: 1,
  first_name: null,
  last_name: null,
  company: null,
  category: null,
  replied: 1,
  reply_at: "2026-09-03T10:00:00Z",
  download_date_field: null,
  ...over,
});

describe("lead dates", () => {
  it("download date: webhook beats custom field beats snapshot", () => {
    const l = lead({ category: "Downloaded", download_date_field: "2026-09-07" });
    const ev = (source: "webhook" | "snapshot", occurred_at: string) => ({ campaign_id: 1, email: "a@x.com", category: "Downloaded", occurred_at, source });
    expect(computeLeadDates(l, [ev("snapshot", "2026-09-09"), ev("webhook", "2026-09-08T13:00:00Z")], S).downloadDay).toBe("2026-09-08");
    expect(computeLeadDates(l, [ev("snapshot", "2026-09-09")], S)).toMatchObject({ downloadDay: "2026-09-07", downloadSource: "custom_field" });
    expect(computeLeadDates({ ...l, download_date_field: null }, [ev("snapshot", "2026-09-09")], S).downloadDay).toBe("2026-09-09");
    expect(computeLeadDates({ ...l, download_date_field: "07/09/2026" }, [], S).downloadDay).toBe("2026-09-07"); // UK format
  });
  it("positive day is the first positive category, and Downloaded counts", () => {
    const events = [
      { campaign_id: 1, email: "a@x.com", category: "Interested", occurred_at: "2026-09-04", source: "snapshot" as const },
      { campaign_id: 1, email: "a@x.com", category: "Downloaded", occurred_at: "2026-09-10", source: "snapshot" as const },
    ];
    expect(computeLeadDates(lead({ category: "Downloaded" }), events, S)).toMatchObject({ positiveDay: "2026-09-04", downloadDay: "2026-09-10" });
    expect(computeLeadDates(lead({ category: "Downloaded" }), events.slice(1), S).positiveDay).toBe("2026-09-10");
  });
  it("out-of-office replies don't count as replies", () => {
    expect(computeLeadDates(lead({ category: "Out Of Office" }), [], S).replyDay).toBeNull();
    expect(computeLeadDates(lead({ category: "out of office" }), [], S).replyDay).toBeNull(); // case-insensitive
    expect(computeLeadDates(lead({ category: "Not Interested" }), [], S).replyDay).toBe("2026-09-03");
  });
});

describe("KPIs on a hand-built dataset", () => {
  // September, costs from 1 Sept, today 30 Sept -> spend = £426.495
  const data: Dataset = {
    campaigns: [
      { id: 1, name: "A", status: "ACTIVE", created_at: "2026-09-01T09:00:00Z" },
      { id: 2, name: "B", status: "PAUSED", created_at: "2026-09-01T09:00:00Z" },
      { id: 3, name: "Draft", status: "DRAFTED", created_at: "2026-09-01T09:00:00Z" },
    ],
    snapshots: [
      { campaign_id: 1, day: "2026-09-30", sent: 3000, unique_sent: 1000, bounced: 30 },
      { campaign_id: 2, day: "2026-09-30", sent: 1000, unique_sent: 500, bounced: 40 },
    ],
    leads: [
      lead({ email: "1@a", category: "Interested" }),
      lead({ email: "2@a", category: "Downloaded" }),
      lead({ email: "3@a", category: "Out Of Office" }),
      lead({ email: "4@a", category: "Not Interested" }),
      lead({ campaign_id: 2, email: "5@b", category: "Meeting Request" }),
      lead({ campaign_id: 2, email: "6@b", category: null }),
    ],
    categoryEvents: [
      { campaign_id: 1, email: "1@a", category: "Interested", occurred_at: "2026-09-05", source: "snapshot" },
      { campaign_id: 1, email: "2@a", category: "Downloaded", occurred_at: "2026-09-12T12:00:00Z", source: "webhook" },
      { campaign_id: 1, email: "3@a", category: "Out Of Office", occurred_at: "2026-09-05", source: "snapshot" },
      { campaign_id: 1, email: "4@a", category: "Not Interested", occurred_at: "2026-09-05", source: "snapshot" },
      { campaign_id: 2, email: "5@b", category: "Meeting Request", occurred_at: "2026-09-06", source: "snapshot" },
    ],
  };
  const period = resolvePeriod("this_month", "2026-09-30", "2026-09-01");
  const k = computeKpis(data, S, period, "2026-09-30");

  it("counts", () => {
    expect(k).toMatchObject({
      emailsSent: 4000,
      prospectsContacted: 1500,
      bounced: 70,
      replies: 5, // 6 replied leads minus 1 out-of-office
      positiveReplies: 3, // Interested, Downloaded, Meeting Request
      downloads: 1,
      campaignsLaunched: 2, // draft excluded
    });
  });
  it("rates and costs", () => {
    expect(k.spend).toBeCloseTo(426.495, 6);
    expect(k.replyRate).toBeCloseTo(5 / 1500, 10);
    expect(k.positiveReplyRate).toBeCloseTo(3 / 1500, 10);
    expect(k.positiveShareOfReplies).toBeCloseTo(3 / 5, 10);
    expect(k.bounceRate).toBeCloseTo(70 / 4000, 10);
    expect(k.cpl).toBeCloseTo(426.495 / 3, 6);
    expect(k.cac).toBeCloseTo(426.495, 6);
    expect(k.replyToDownloadRate).toBeCloseTo(1 / 3, 10);
  });
  it("allocates spend by share of emails sent", () => {
    const rows = computeCampaignTable(data, S, period, "2026-09-30");
    expect(rows).toHaveLength(2);
    const [a, b] = rows;
    expect(a.allocatedSpend).toBeCloseTo(426.495 * 0.75, 6);
    expect(b.allocatedSpend).toBeCloseTo(426.495 * 0.25, 6);
    expect(a.cac).toBeCloseTo(426.495 * 0.75, 6);
    expect(b.cac).toBeNull(); // no downloads -> shown as —
    expect(b.bounceRate).toBeCloseTo(0.04, 10); // above 3%: highlighted red
  });
});
