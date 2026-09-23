/** Bundles the page into one HTML file for claude.ai: artifact/dist/cold-email-economics.html */
import fs from "node:fs";
import path from "node:path";
import { bundlePage, ROOT } from "./bundle";

async function main() {
  const { js, shell } = await bundlePage();
  const html = shell.replace("/*BUNDLE*/", () => js);
  fs.mkdirSync(path.join(ROOT, "artifact/dist"), { recursive: true });
  const file = path.join(ROOT, "artifact/dist/cold-email-economics.html");
  fs.writeFileSync(file, html);
  console.log(`${file} (${(html.length / 1024).toFixed(0)} KB)`);
}

main();
