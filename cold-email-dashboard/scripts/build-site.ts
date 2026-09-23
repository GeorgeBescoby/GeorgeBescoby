/**
 * Builds the static site for Cloudflare Pages.
 *
 *   npm run site:build -- <state-dir> <out-dir>
 *
 * Embeds dashboard.settings.json and the state documents (campaign snapshots,
 * hashed leads, last sync) into site/index.html. In sample mode no data is
 * embedded; the page generates its own sample numbers.
 */
import fs from "node:fs";
import path from "node:path";
import { readSiteSettings } from "../lib/site-settings";
import { readDocs } from "../lib/state-files";
import { bundlePage, ROOT } from "./bundle";

async function main() {
  const [stateDir, outDir] = process.argv.slice(2);
  if (!stateDir || !outDir) {
    console.error("Usage: npm run site:build -- <state-dir> <out-dir>");
    process.exit(1);
  }
  const { dataMode, settings } = readSiteSettings(path.join(ROOT, "dashboard.settings.json"));
  const docs = dataMode === "live" ? readDocs(stateDir) : [];
  const pick = (c: string) => docs.filter((d) => d.collection === c).map((d) => d.data);
  const payload = {
    dataMode,
    settings,
    campaigns: pick("campaigns"),
    leads: pick("leads"),
    sync: docs.find((d) => d.collection === "meta" && d.doc_id === "sync")?.data ?? null,
    builtAt: new Date().toISOString(),
  };

  const { js, shell } = await bundlePage();
  const data = JSON.stringify(payload).replace(/</g, "\\u003c");
  const body = shell.replace("<script>/*BUNDLE*/</script>", () => `<script>window.__DASHBOARD__ = ${data};</script>\n<script>${js}</script>`);
  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<style>[hidden]{display:none!important} body{margin:0} img{max-width:100%}</style>
${body.replace(/<div id="app"><\/div>[\s\S]*$/, "")}
</head>
<body>
<div id="app"></div>
${body.slice(body.indexOf('<div id="app"></div>') + '<div id="app"></div>'.length)}
</body>
</html>
`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html);
  // Cloudflare Pages headers: never cache the data, never index the site.
  fs.writeFileSync(
    path.join(outDir, "_headers"),
    "/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n",
  );
  console.log(`${path.join(outDir, "index.html")} (${(html.length / 1024).toFixed(0)} KB, ${dataMode} data, ${payload.campaigns.length} campaigns)`);
}

main();
