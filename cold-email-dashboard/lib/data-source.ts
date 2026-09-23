// Single entry point for pages: picks mock or live data and the settings to use.
import type { Client } from "@libsql/client";
import type { Settings } from "@/config/defaults";
import { createMemoryDb, getMainDb } from "./db";
import { addDays, today, type Day } from "./dates";
import { MOCK_HISTORY_DAYS, seedMockDb } from "./mock/generate";
import type { Dataset } from "./metrics/types";
import { lastSyncRun, loadDataset, type SyncRun } from "./repository";
import { getDataMode, getSettings, type DataMode } from "./settings";

const g = globalThis as unknown as { __mockDb?: { day: Day; db: Promise<Client> } };

/** In-memory mock database, regenerated once per day so "This week" always has data. */
export function getMockDb(todayDay: Day): Promise<Client> {
  if (!g.__mockDb || g.__mockDb.day !== todayDay) {
    g.__mockDb = {
      day: todayDay,
      db: (async () => {
        const db = await createMemoryDb();
        await seedMockDb(db, todayDay);
        return db;
      })(),
    };
  }
  return g.__mockDb.db;
}

export type DashboardContext = {
  mode: DataMode;
  settings: Settings;
  dataset: Dataset;
  today: Day;
  lastSync: SyncRun | null;
};

export async function getDashboardContext(): Promise<DashboardContext> {
  const main = await getMainDb();
  const mode = await getDataMode(main);
  const settings = await getSettings(main);
  const todayDay = today();

  if (mode === "mock") {
    const db = await getMockDb(todayDay);
    // Mock costs start with the mock timeline; your real cost start date is untouched.
    const mockSettings = { ...settings, costStartDate: addDays(todayDay, -MOCK_HISTORY_DAYS) };
    return { mode, settings: mockSettings, dataset: await loadDataset(db), today: todayDay, lastSync: null };
  }
  return { mode, settings, dataset: await loadDataset(main), today: todayDay, lastSync: await lastSyncRun(main) };
}
