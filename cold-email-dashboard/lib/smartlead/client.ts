// Minimal Smartlead API client. Server-side only: the API key is read from the
// environment and never sent to the browser.
//
// Rate limits (https://api.smartlead.ai/guides/rate-limits): Standard plan is
// 60 req/min, 1,000 req/hour, 10 req/s burst, shared across all endpoints. We
// space requests out (minGapMs) and back off on 429.

export const SMARTLEAD_BASE_URL = "https://server.smartlead.ai/api/v1";

// ~55 req/min, under the Standard 60/min limit. Overridable for tests.
const minGapMs = () => Number(process.env.SMARTLEAD_MIN_GAP_MS ?? 1100);
const MAX_RETRIES = 4;

let lastRequestAt = 0;
let requestCount = 0;

export class SmartleadError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
  ) {
    super(message);
  }
}

function apiKey(): string {
  const key = process.env.SMARTLEAD_API_KEY;
  if (!key) throw new Error("SMARTLEAD_API_KEY is not set");
  return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function getRequestCount() {
  return requestCount;
}

export async function smartleadGet<T = unknown>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  return smartleadRequest<T>("GET", path, params);
}

export async function smartleadPost<T = unknown>(
  path: string,
  body: unknown,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  return smartleadRequest<T>("POST", path, params, body);
}

async function smartleadRequest<T>(
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  body?: unknown,
): Promise<T> {
  const url = new URL(SMARTLEAD_BASE_URL + path);
  url.searchParams.set("api_key", apiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + minGapMs() - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    requestCount++;

    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      // Endpoint-specific 429s have no Retry-After; docs say fall back to up to 60s.
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep((retryAfter > 0 ? retryAfter : 15 * (attempt + 1)) * 1000);
      continue;
    }
    if (res.status >= 500 && attempt < MAX_RETRIES) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
      // Never include the URL in errors: it carries the API key.
      throw new SmartleadError(`Smartlead ${method} ${path} failed with ${res.status}`, res.status, text.slice(0, 500));
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }
}
