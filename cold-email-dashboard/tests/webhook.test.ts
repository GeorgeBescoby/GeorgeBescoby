import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/config/defaults";
import { createMemoryDb } from "@/lib/db";
import { computeLeadDates } from "@/lib/metrics/compute";
import { loadDataset } from "@/lib/repository";
import { categoryEventStatement, leadKey, leadUpsertStatement } from "@/lib/smartlead/store";
import { handleWebhook } from "@/lib/smartlead/webhook";

describe("webhook + sync merge", () => {
  it("records reply time and Downloaded timestamp, and the later sync doesn't overwrite them", async () => {
    const db = await createMemoryDb();

    await handleWebhook(db, {
      event_type: "EMAIL_REPLY",
      to_email: "Jane@Shop.com",
      to_name: "Jane Doe",
      time_replied: "2026-09-03T09:15:00Z",
      campaign_id: 7,
    });
    await handleWebhook(db, {
      event_type: "LEAD_CATEGORY_UPDATED",
      lead_id: 99,
      lead_email: "jane@shop.com",
      lead_data: { first_name: "Jane", company_name: "Shop" },
      category: "Downloaded",
      campaign_id: 7,
    });

    // Daily sync sees the same lead two days later.
    const now = "2026-09-10T22:55:00Z";
    await db.batch([
      leadUpsertStatement(
        { campaign_id: 7, email: "jane@shop.com", lead_id: 99, category: "Downloaded", replied: true, reply_at: now, reply_source: "snapshot" },
        now,
      ),
      categoryEventStatement(7, "jane@shop.com", "Downloaded", "2026-09-10", "snapshot"),
    ]);

    const data = await loadDataset(db);
    expect(data.leads).toHaveLength(1); // one lead, not a duplicate
    const l = data.leads[0];
    expect(l.email).toBe(leadKey("jane@shop.com"));
    expect(l.email).not.toContain("@");
    expect(l).toMatchObject({ lead_id: 99, first_name: "Jane", company: "Shop", replied: 1, reply_at: "2026-09-03T09:15:00Z" });

    const dates = computeLeadDates(l, data.categoryEvents, DEFAULT_SETTINGS);
    expect(dates.replyDay).toBe("2026-09-03");
    expect(dates.downloadSource).toBe("webhook");
    expect(dates.downloadDay).toBe(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date()));
  });

  it("ignores other events without failing", async () => {
    const db = await createMemoryDb();
    expect(await handleWebhook(db, { event_type: "EMAIL_OPEN", campaign_id: 1 })).toMatchObject({ handled: false });
  });
});
