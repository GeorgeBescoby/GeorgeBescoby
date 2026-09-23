/** Bundles artifact/src/main.ts into a single HTML file: artifact/dist/cold-email-economics.html */
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

async function main() {
  const root = path.resolve(__dirname, "..");
  const out = await build({
    entryPoints: [path.join(root, "artifact/src/main.ts")],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2020",
    minify: true,
    alias: { "@": root },
    define: { "process.env.DASHBOARD_TODAY": "undefined" },
    logLevel: "warning",
  });
  const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const shell = fs.readFileSync(path.join(root, "artifact/shell.html"), "utf8");
  const html = shell.replace("/*BUNDLE*/", () => js);
  fs.mkdirSync(path.join(root, "artifact/dist"), { recursive: true });
  const file = path.join(root, "artifact/dist/cold-email-economics.html");
  fs.writeFileSync(file, html);
  console.log(`${file} (${(html.length / 1024).toFixed(0)} KB)`);
}

main();
