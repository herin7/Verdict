/** Shared GET for marketplace product HTML. Native fetch only. */

import { fetchWithRetry } from "../../http.js";

export const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-IN,en;q=0.9",
  "Cache-Control": "no-cache",
};

/**
 * Fetch HTML with browser-like UA. Short timeout; one retry on network/5xx.
 * # ponytail: Amazon/Flipkart may 403/503 from datacenter IPs — callers fall back to Firecrawl.
 */
export async function fetchHtml(
  url: string,
  opts: { timeoutMs?: number } = {}
): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false; status?: number; error: string }> {
  const timeoutMs = opts.timeoutMs ?? 5_000;
  try {
    const res = await fetchWithRetry(
      url,
      { method: "GET", headers: DEFAULT_HEADERS, redirect: "follow" },
      { timeoutMs, retries: 1, backoffMs: 200 }
    );
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    if (!html || html.length < 200) {
      return { ok: false, status: res.status, error: "empty_html" };
    }
    return { ok: true, html, finalUrl: res.url || url };
  } catch (err) {
    return { ok: false, error: (err as Error).message || "fetch_failed" };
  }
}
