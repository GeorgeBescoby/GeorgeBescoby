// Simple shared-password protection. The session cookie holds an HMAC derived
// from the password, so changing DASHBOARD_PASSWORD logs everyone out.
import crypto from "node:crypto";

export const SESSION_COOKIE = "ced_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function sessionToken(): string | null {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return null;
  const secret = process.env.SESSION_SECRET || password;
  return crypto.createHmac("sha256", secret).update(`dashboard-session:v1:${password}`).digest("hex");
}

export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function isValidSession(cookieValue: string | undefined): boolean {
  return safeEqual(cookieValue, sessionToken());
}

export function checkPassword(input: string): boolean {
  return safeEqual(input, process.env.DASHBOARD_PASSWORD);
}
