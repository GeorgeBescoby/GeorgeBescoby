/**
 * Daily sync step for the GitHub Actions site: npm run site:sync -- <state-dir>
 * Skipped in sample mode. Needs SMARTLEAD_API_KEY.
 */
import path from "node:path";
import { syncStateDir } from "../lib/site-sync";
import { readSiteSettings } from "../lib/site-settings";
import { ROOT } from "./bundle";

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: npm run site:sync -- <state-dir>");
    process.exit(1);
  }
  const { dataMode, settings } = readSiteSettings(path.join(ROOT, "dashboard.settings.json"));
  if (dataMode !== "live") {
    console.log('dataMode is "sample" in dashboard.settings.json: skipping the Smartlead sync.');
    return;
  }
  const r = await syncStateDir(dir, settings);
  console.log(r);
  // Exit 0 either way: the error is recorded in the state and shown on the site.
}

main();
