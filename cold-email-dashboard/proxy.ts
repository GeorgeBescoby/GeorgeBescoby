// Password gate for every page. The webhook and cron routes are excluded here
// and check their own secrets instead.
import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";

export function proxy(request: NextRequest) {
  if (!process.env.DASHBOARD_PASSWORD) {
    return new NextResponse("DASHBOARD_PASSWORD is not set. Add it to your environment variables.", { status: 500 });
  }
  if (isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const login = new URL("/login", request.url);
  if (request.nextUrl.pathname !== "/") login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api/login|api/webhooks|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
