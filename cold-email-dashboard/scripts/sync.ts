/** Run the Smartlead sync once from the command line. Usage: npm run sync */
import { getMainDb } from "../lib/db";
import { runSync } from "../lib/smartlead/sync";

try {
  process.loadEnvFile?.(".env");
} catch {
  /* no .env */
}

async function main() {
  const r = await runSync(await getMainDb(), "cli");
  console.log(r);
  process.exit(r.ok ? 0 : 1);
}
main();
