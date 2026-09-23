// Smartlead webhook receiver. Smartlead doesn't sign webhooks, so the URL
// carries a secret: https://<your-host>/api/webhooks/smartlead?token=$WEBHOOK_SECRET
import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { getMainDb } from "@/lib/db";
import { handleWebhook } from "@/lib/smartlead/webhook";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || !safeEqual(request.nextUrl.searchParams.get("token"), secret)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const result = await handleWebhook(await getMainDb(), payload);
  return NextResponse.json({ received: true, ...result });
}
