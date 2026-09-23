// One sync step for the GitHub Actions site: state folder in, Smartlead sync,
// state folder out (in place). History lives only in the state folder, which
// the workflow keeps on a branch of the private repo.
import type { Settings } from "@/config/defaults";
import type { Doc } from "./artifact-state";
import { exportDocs, importDocs } from "./artifact-state-db";
import { createMemoryDb } from "./db";
import { saveSettings } from "./settings";
import { runSync, type SyncResult } from "./smartlead/sync";
import { readDocs, writeDocsDir } from "./state-files";

export async function syncStateDir(dir: string, settings: Settings): Promise<SyncResult> {
  const db = await createMemoryDb();
  await saveSettings(db, settings);
  await importDocs(db, readDocs(dir));
  const result = await runSync(db, "cli");
  const docs: Doc[] = await exportDocs(db);
  docs.push({
    collection: "meta",
    doc_id: "sync",
    data: { status: result.ok ? "ok" : "error", message: result.message, finished_at: new Date().toISOString() },
  });
  // On error the imported history is written back unchanged (plus the error), so nothing is lost.
  writeDocsDir(dir, docs);
  return result;
}
