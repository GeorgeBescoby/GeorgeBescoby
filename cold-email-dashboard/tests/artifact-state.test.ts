import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/config/defaults";
import { datasetFromDocs, type CampaignDoc, type LeadsDoc } from "@/lib/artifact-state";
import { exportDocs, importDocs } from "@/lib/artifact-state-db";
import { addDays, PERIODS, resolvePeriod } from "@/lib/dates";
import { createMemoryDb } from "@/lib/db";
import { allTimeStart, computeKpis } from "@/lib/metrics/compute";
import { MOCK_HISTORY_DAYS, seedMockDb } from "@/lib/mock/generate";
import { loadDataset } from "@/lib/repository";

const TODAY = "2026-09-23";

describe("artifact documents", () => {
  it("round-trip without loss and give identical KPIs", async () => {
    const db = await createMemoryDb();
    await seedMockDb(db, TODAY);
    const docs = await exportDocs(db);

    // Every document fits the store's 256 KiB limit.
    for (const d of docs) expect(JSON.stringify(d.data).length).toBeLessThan(256 * 1024);

    // Import into a fresh database and export again: identical.
    const db2 = await createMemoryDb();
    await importDocs(db2, docs);
    expect(await exportDocs(db2)).toEqual(docs);

    // The browser's reading of the documents gives the same KPIs as the database.
    const fromDocs = datasetFromDocs(
      docs.filter((d) => d.collection === "campaigns").map((d) => d.data as unknown as CampaignDoc),
      docs.filter((d) => d.collection === "leads").map((d) => d.data as unknown as LeadsDoc),
    );
    const fromDb = await loadDataset(db);
    const settings = { ...DEFAULT_SETTINGS, costStartDate: addDays(TODAY, -MOCK_HISTORY_DAYS) };
    for (const p of PERIODS) {
      const period = resolvePeriod(p.key, TODAY, allTimeStart(fromDb, settings));
      expect(computeKpis(fromDocs, settings, period, TODAY)).toEqual(computeKpis(fromDb, settings, period, TODAY));
    }
  });
});
