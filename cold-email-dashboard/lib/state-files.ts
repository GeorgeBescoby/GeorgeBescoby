// Reads/writes dashboard state documents (see lib/artifact-state.ts) as a
// folder of JSON files: <dir>/<collection>/<doc_id>.json. Used by the claude.ai
// routine (ArtifactData out_dir) and by the GitHub Actions site build.
import fs from "node:fs";
import path from "node:path";
import { unwrapDoc, type Doc } from "./artifact-state";

export function readDocs(dir: string): Doc[] {
  const docs: Doc[] = [];
  if (!fs.existsSync(dir)) return docs;
  for (const collection of fs.readdirSync(dir).sort()) {
    const cdir = path.join(dir, collection);
    if (!fs.statSync(cdir).isDirectory() || collection.startsWith(".")) continue;
    for (const f of fs.readdirSync(cdir).filter((f) => f.endsWith(".json")).sort()) {
      docs.push({ collection, doc_id: f.replace(/\.json$/, ""), data: unwrapDoc(JSON.parse(fs.readFileSync(path.join(cdir, f), "utf8"))) });
    }
  }
  return docs;
}

/** Replace the managed collections in <dir> with exactly `docs`. */
export function writeDocsDir(dir: string, docs: Doc[], managed = ["campaigns", "leads", "health", "meta"]) {
  for (const c of managed) fs.rmSync(path.join(dir, c), { recursive: true, force: true });
  for (const d of docs) {
    fs.mkdirSync(path.join(dir, d.collection), { recursive: true });
    fs.writeFileSync(path.join(dir, d.collection, `${d.doc_id}.json`), JSON.stringify(d.data, null, 1) + "\n");
  }
}
