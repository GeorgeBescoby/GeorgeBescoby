// Runs the full sync against a fake Smartlead that returns the response shapes
// shown in the official docs (including the variants that disagree).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "@/lib/db";
import { runSync } from "@/lib/smartlead/sync";

const routes: Record<string, (q: URLSearchParams) => unknown> = {
  "/leads/fetch-categories": () => [
    { id: 1, name: "Interested", sentiment_type: "positive" },
    { id: 3, name: "Out Of Office", sentiment_type: "neutral" },
    { id: 50, name: "Downloaded", sentiment_type: "positive" },
  ],
  // Documented as a bare array on one page, wrapped on another: use the wrapped one.
  "/campaigns/": () => ({
    campaigns: [
      { id: 11, name: "Founders", status: "ACTIVE", created_at: "2026-09-01T10:00:00Z" },
      { id: 12, name: "Draft", status: "DRAFTED", created_at: "2026-09-01T10:00:00Z" },
      { id: 13, name: "Thin analytics", status: "PAUSED", created_at: "2026-08-20T10:00:00Z" },
    ],
  }),
  "/campaigns/11/analytics": () => ({ sent_count: "1200", unique_sent_count: "500", bounce_count: "18", reply_count: "9" }),
  // The docs' /analytics example has no unique/bounce counts -> sync falls back to analytics-by-date windows.
  "/campaigns/13/analytics": () => ({ campaign_id: 13, total_sent: 400, total_replied: 3, bounce_rate: 2.0 }),
  "/campaigns/13/analytics-by-date": (q) =>
    q.get("start_date") === "2026-08-20"
      ? { sent_count: "300", unique_sent_count: "150", bounce_count: "6", total_reply_count: "2" }
      : { sent_count: "100", unique_sent_count: "20", bounce_count: "2", total_reply_count: "1" },
  "/campaigns/11/statistics": () => ({
    total_stats: 1,
    data: [{ lead_email: "amy@a.com", sequence_number: 1, reply_time: "2026-09-04T08:30:00Z" }],
  }),
  "/campaigns/13/statistics": () => ({ ok: true, data: [] }),
  "/campaigns/11/leads": (q) => {
    const item = (id: number, email: string, cat: number | null, custom = {}) => ({
      lead_category_id: cat,
      status: "INPROGRESS",
      lead: { id, email, first_name: "X", company_name: "Co", custom_fields: custom },
    });
    if (q.get("emailStatus") === "is_replied") return { total_leads: "2", data: [item(1, "Amy@a.com", 1), item(2, "bob@b.com", 3)] };
    if (q.get("lead_category_id") === "50") return { total_leads: "1", data: [item(3, "cat@c.com", 50, { download_date: "2026-09-06" })] };
    return { total_leads: "0", data: [] };
  },
  "/campaigns/13/leads": () => ({ total_leads: "0", data: [] }),
  "/email-accounts/": () => [{ id: 900, from_email: "george@askbosco-mail.com", daily_sent_count: 20, warmup_details: { status: "ACTIVE", warmup_reputation: "98%" } }],
};

beforeEach(() => {
  process.env.SMARTLEAD_API_KEY = "test";
  process.env.SMARTLEAD_MIN_GAP_MS = "0";
  vi.stubGlobal("fetch", async (url: URL) => {
    const handler = routes[url.pathname.replace("/api/v1", "")];
    if (!handler) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(handler(url.searchParams)), { status: 200 });
  });
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-23T21:55:00Z") });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("runSync", () => {
  it("stores snapshots, leads, categories and inboxes", async () => {
    const db = await createMemoryDb();
    const result = await runSync(db, "cli");
    expect(result).toMatchObject({ ok: true });

    const snaps = (await db.execute("SELECT campaign_id, day, sent, unique_sent, bounced FROM campaign_snapshots ORDER BY campaign_id")).rows;
    expect(snaps.map((r) => ({ ...r }))).toEqual([
      { campaign_id: 11, day: "2026-09-23", sent: 1200, unique_sent: 500, bounced: 18 },
      { campaign_id: 13, day: "2026-09-23", sent: 400, unique_sent: 170, bounced: 8 }, // summed windows
    ]);

    const leads = (await db.execute("SELECT email, category, replied, reply_at, download_date_field FROM leads ORDER BY email")).rows.map((r) => ({ ...r }));
    expect(leads).toEqual([
      { email: "amy@a.com", category: "Interested", replied: 1, reply_at: "2026-09-04T08:30:00Z", download_date_field: null },
      { email: "bob@b.com", category: "Out Of Office", replied: 1, reply_at: "2026-09-23T21:55:00.000Z", download_date_field: null },
      { email: "cat@c.com", category: "Downloaded", replied: 0, reply_at: null, download_date_field: "2026-09-06" },
    ]);

    const events = (await db.execute("SELECT email, category, occurred_at, source FROM lead_category_events ORDER BY email")).rows.length;
    expect(events).toBe(3);
    const inbox = (await db.execute("SELECT warmup_reputation FROM email_account_snapshots")).rows[0];
    expect(inbox.warmup_reputation).toBe(98);

    // A manual refresh straight after is throttled.
    expect(await runSync(db, "manual")).toMatchObject({ skipped: true });
  });
});
