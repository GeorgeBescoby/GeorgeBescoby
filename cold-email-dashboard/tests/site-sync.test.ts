// Two daily runs of the GitHub Actions sync against a fake Smartlead: history
// accumulates in the state folder and first-seen dates are never overwritten.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/config/defaults";
import { datasetFromDocs, type CampaignDoc, type LeadsDoc } from "@/lib/artifact-state";
import { computeLeadDates } from "@/lib/metrics/compute";
import { syncStateDir } from "@/lib/site-sync";
import { readDocs } from "@/lib/state-files";

let sent = 100;
let aliceCategory = 1; // Interested on day 1, Downloaded on day 2

beforeEach(() => {
  process.env.SMARTLEAD_API_KEY = "test";
  process.env.SMARTLEAD_MIN_GAP_MS = "0";
  vi.stubGlobal("fetch", async (url: URL) => {
    const p = url.pathname.replace("/api/v1", "");
    const q = url.searchParams;
    const lead = (cat: number) => ({ lead_category_id: cat, lead: { id: 1, email: "alice@shop.com", custom_fields: {} } });
    const body =
      p === "/leads/fetch-categories" ? [{ id: 1, name: "Interested" }, { id: 50, name: "Downloaded" }]
      : p === "/campaigns/" ? [{ id: 7, name: "Founders", status: "ACTIVE", created_at: "2026-09-01T09:00:00Z" }]
      : p === "/campaigns/7/analytics" ? { sent_count: String(sent), unique_sent_count: String(sent / 2), bounce_count: "1" }
      : p === "/campaigns/7/statistics" ? { data: [] }
      : p === "/campaigns/7/leads" ? (q.get("emailStatus") === "is_replied" ? { data: [lead(aliceCategory)] } : { data: [] })
      : p === "/email-accounts/" ? []
      : null;
    return body === null ? new Response("nf", { status: 404 }) : new Response(JSON.stringify(body));
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("site sync state folder", () => {
  it("accumulates daily snapshots and keeps first-seen dates", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "state-"));
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-22T21:55:00Z") });
    expect(await syncStateDir(dir, DEFAULT_SETTINGS)).toMatchObject({ ok: true });

    sent = 300;
    aliceCategory = 50;
    vi.setSystemTime(new Date("2026-09-23T21:55:00Z"));
    expect(await syncStateDir(dir, DEFAULT_SETTINGS)).toMatchObject({ ok: true });

    const docs = readDocs(dir);
    const campaign = docs.find((d) => d.collection === "campaigns")!.data as unknown as CampaignDoc;
    expect(campaign.snapshots).toEqual([
      ["2026-09-22", 100, 50, 1],
      ["2026-09-23", 300, 150, 1],
    ]);

    const data = datasetFromDocs([campaign], docs.filter((d) => d.collection === "leads").map((d) => d.data as unknown as LeadsDoc));
    expect(data.leads).toHaveLength(1);
    const dates = computeLeadDates(data.leads[0], data.categoryEvents, DEFAULT_SETTINGS);
    expect(dates).toMatchObject({ replyDay: "2026-09-22", positiveDay: "2026-09-22", downloadDay: "2026-09-23" });
    expect(docs.find((d) => d.collection === "meta")!.data).toMatchObject({ status: "ok" });
    // No email addresses stored anywhere in the state.
    expect(fs.readdirSync(dir, { recursive: true }).map(String).join()).not.toContain("@");
    for (const d of docs) expect(JSON.stringify(d.data)).not.toContain("alice");
  });
});
