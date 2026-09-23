// Daily snapshot job. Call with `Authorization: Bearer $CRON_SECRET` (Vercel Cron
// sends this automatically when CRON_SECRET is set) or `?secret=$CRON_SECRET`.
import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { getMainDb } from "@/lib/db";
import { runSync } from "@/lib/smartlead/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = header || request.nextUrl.searchParams.get("secret");
  if (!secret || !safeEqual(provided, secret)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!process.env.SMARTLEAD_API_KEY) return NextResponse.json({ error: "SMARTLEAD_API_KEY is not set" }, { status: 500 });

  const result = await runSync(await getMainDb(), "cron");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
