// Shared esbuild step: artifact/src/main.ts -> one inline script string.
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

export const ROOT = path.resolve(__dirname, "..");

export async function bundlePage(): Promise<{ js: string; shell: string }> {
  const out = await build({
    entryPoints: [path.join(ROOT, "artifact/src/main.ts")],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2020",
    minify: true,
    alias: { "@": ROOT },
    define: { "process.env.DASHBOARD_TODAY": "undefined" },
    logLevel: "warning",
  });
  return {
    js: out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script"),
    shell: fs.readFileSync(path.join(ROOT, "artifact/shell.html"), "utf8"),
  };
}
