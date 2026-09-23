/**
 * Registers an account-wide Smartlead webhook pointing at this dashboard.
 * Usage: npm run webhook:create -- https://your-dashboard.example.com
 *
 * Uses POST /webhook/create with association_type "user" (all campaigns),
 * subscribed to LEAD_CATEGORY_UPDATED and EMAIL_REPLY.
 * https://api.smartlead.ai/api-reference/webhooks/create
 */
import { smartleadPost } from "../lib/smartlead/client";

try {
  process.loadEnvFile?.(".env");
} catch {
  /* no .env */
}

async function main() {
  const base = process.argv[2]?.replace(/\/$/, "");
  if (!base || !process.env.WEBHOOK_SECRET) {
    console.error("Usage: npm run webhook:create -- https://your-dashboard-url   (WEBHOOK_SECRET and SMARTLEAD_API_KEY must be set)");
    process.exit(1);
  }

  const url = `${base}/api/webhooks/smartlead?token=${encodeURIComponent(process.env.WEBHOOK_SECRET)}`;
  const res = await smartleadPost("/webhook/create", {
    name: "Cold email dashboard",
    webhook_url: url,
    association_type: "user",
    event_type_map: { LEAD_CATEGORY_UPDATED: true, EMAIL_REPLY: true },
  });
  console.log(JSON.stringify(res, null, 2));
}
main();
