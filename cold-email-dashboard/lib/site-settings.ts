// Settings for the GitHub Actions site: dashboard.settings.json in the repo.
//   { "dataMode": "sample" | "live", "settings": { ...any fields of config/defaults.ts to override } }
// Edit it on GitHub; the next run rebuilds the site with it.
import fs from "node:fs";
import { DEFAULT_SETTINGS, type Settings } from "@/config/defaults";
import { validateSettings } from "./settings";

export type SiteSettings = { dataMode: "sample" | "live"; settings: Settings };

export function readSiteSettings(file: string): SiteSettings {
  const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const settings: Settings = { ...structuredClone(DEFAULT_SETTINGS), ...(raw.settings ?? {}) };
  const v = validateSettings(settings);
  if (!v.ok) throw new Error(`${file}: ${v.error}`);
  return { dataMode: raw.dataMode === "live" ? "live" : "sample", settings };
}
