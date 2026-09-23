/**
 * Daily sync for the claude.ai artifact version of the dashboard.
 *
 *   npm run artifact:sync -- <in-dir> <out-dir>
 *
 * <in-dir>  documents read from the artifact with ArtifactData list + out_dir
 *           (<in-dir>/<collection>/<doc_id>.json for settings, campaigns, leads, health)
 * <out-dir> gets one JSON file per document to write back, plus
 *           batch-1.json, batch-2.json…: ready-made ArtifactData "batch" write lists
 *           (≤ 50 each; campaigns/leads docs that no longer exist are deleted).
 *
 * Pass --no-sync to only round-trip the data (used by tests), or --sample to
 * write the sample dataset instead of calling Smartlead.
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS, type Settings } from "../config/defaults";
import { unwrapDoc, type Doc } from "../lib/artifact-state";
import { exportDocs, importDocs } from "../lib/artifact-state-db";
import { createMemoryDb } from "../lib/db";
import { londonDay } from "../lib/dates";
import { seedMockDb } from "../lib/mock/generate";
import { saveSettings } from "../lib/settings";
import { runSync } from "../lib/smartlead/sync";

try {
  process.loadEnvFile?.(".env");
} catch {
  /* no .env */
}

function readDocs(dir: string): Doc[] {
  const docs: Doc[] = [];
  if (!fs.existsSync(dir)) return docs;
  for (const collection of fs.readdirSync(dir)) {
    const cdir = path.join(dir, collection);
    if (!fs.statSync(cdir).isDirectory()) continue;
    for (const f of fs.readdirSync(cdir).filter((f) => f.endsWith(".json"))) {
      docs.push({ collection, doc_id: f.replace(/\.json$/, ""), data: unwrapDoc(JSON.parse(fs.readFileSync(path.join(cdir, f), "utf8"))) });
    }
  }
  return docs;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
  const [inDir, outDir] = args;
  if (!inDir || !outDir) {
    console.error("Usage: npm run artifact:sync -- <in-dir> <out-dir> [--no-sync] [--sample]");
    process.exit(1);
  }

  const input = readDocs(inDir);
  const settingsDoc = input.find((d) => d.collection === "settings" && d.doc_id === "main")?.data as { settings?: Partial<Settings> } | undefined;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(settingsDoc?.settings ?? {}) };

  const db = await createMemoryDb();
  await saveSettings(db, settings);
  let status = "ok";
  let message = "Round-trip only";

  if (flags.has("--sample")) {
    await seedMockDb(db, londonDay());
    message = "Sample data";
  } else {
    await importDocs(db, input);
    if (!flags.has("--no-sync")) {
      const r = await runSync(db, "cli");
      status = r.ok ? "ok" : "error";
      message = r.message;
      console.log(r);
    }
  }

  const docs = await exportDocs(db);
  docs.push({ collection: "meta", doc_id: "sync", data: { status, message, finished_at: new Date().toISOString() } });

  // Delete stale campaign/lead/health docs (e.g. a leads chunk that no longer exists).
  const keep = new Set(docs.map((d) => `${d.collection}/${d.doc_id}`));
  const deletes = input
    .filter((d) => ["campaigns", "leads", "health"].includes(d.collection) && !keep.has(`${d.collection}/${d.doc_id}`))
    .map((d) => ({ op: "delete", collection: d.collection, doc_id: d.doc_id }));

  fs.mkdirSync(outDir, { recursive: true });
  const writes: Record<string, unknown>[] = [];
  for (const d of docs) {
    const file = path.resolve(outDir, `${d.collection}__${d.doc_id}.json`);
    fs.writeFileSync(file, JSON.stringify(d.data));
    writes.push({ op: "set", collection: d.collection, doc_id: d.doc_id, file_path: file });
  }
  writes.push(...deletes);
  let n = 0;
  for (let i = 0; i < writes.length; i += 50) {
    fs.writeFileSync(path.join(outDir, `batch-${++n}.json`), JSON.stringify(writes.slice(i, i + 50), null, 1));
  }
  console.log(`${docs.length} documents to write, ${deletes.length} to delete, in ${n} batch file(s): ${outDir}/batch-*.json`);
  process.exit(status === "ok" ? 0 : 1);
}

main();
