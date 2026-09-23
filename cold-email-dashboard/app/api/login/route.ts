import { NextResponse, type NextRequest } from "next/server";
import { checkPassword, sessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const next = String(form.get("next") || "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!checkPassword(String(form.get("password") || ""))) {
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(safeNext)}`, request.url), 303);
  }
  const res = NextResponse.redirect(new URL(safeNext, request.url), 303);
  res.cookies.set(SESSION_COOKIE, sessionToken()!, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
