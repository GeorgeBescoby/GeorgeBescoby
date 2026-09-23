// Settings = config/defaults.ts overlaid with edits saved from the Settings page.
import type { Client } from "@libsql/client";
import { DEFAULT_SETTINGS, type Settings } from "@/config/defaults";

export type DataMode = "mock" | "live";

export async function getSettings(db: Client): Promise<Settings> {
  const res = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'settings'", args: [] });
  if (!res.rows.length) return structuredClone(DEFAULT_SETTINGS);
  try {
    const saved = JSON.parse(String(res.rows[0].value)) as Partial<Settings>;
    return { ...structuredClone(DEFAULT_SETTINGS), ...saved };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export async function saveSettings(db: Client, s: Settings) {
  await db.execute({
    sql: "INSERT INTO settings (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [JSON.stringify(s)],
  });
}

export async function resetSettings(db: Client) {
  await db.execute("DELETE FROM settings WHERE key = 'settings'");
}

/** DATA_MODE env var is the default; the Settings page toggle overrides it. */
export async function getDataMode(db: Client): Promise<DataMode> {
  const res = await db.execute("SELECT value FROM settings WHERE key = 'data_mode'");
  const v = res.rows[0]?.value ?? process.env.DATA_MODE ?? "mock";
  return v === "live" ? "live" : "mock";
}

export async function setDataMode(db: Client, mode: DataMode) {
  await db.execute({
    sql: "INSERT INTO settings (key, value) VALUES ('data_mode', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [mode],
  });
}

/** Validate and coerce a settings object coming from the Settings form. */
export function validateSettings(input: Settings): { ok: true; settings: Settings } | { ok: false; error: string } {
  if (!(input.usdToGbp > 0 && input.usdToGbp < 10)) return { ok: false, error: "USD → GBP rate must be between 0 and 10." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.costStartDate)) return { ok: false, error: "Cost start date must be YYYY-MM-DD." };
  for (const c of input.costs) {
    if (!c.label.trim()) return { ok: false, error: "Every cost needs a name." };
    if (!(c.usdPerMonth >= 0)) return { ok: false, error: `Cost for ${c.label} must be a positive number.` };
  }
  if (!input.positiveCategories.length) return { ok: false, error: "Add at least one positive category." };
  if (!input.downloadCategory.trim()) return { ok: false, error: "Download category can't be empty." };
  return { ok: true, settings: input };
}
