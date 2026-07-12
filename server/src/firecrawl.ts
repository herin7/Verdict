import { config } from "./config.js";
import type { SearchResult, ScrapedPage } from "./anakin.js";

/** Firecrawl is only used as a fallback and only when an API key is configured. */
export function firecrawlEnabled(): boolean {
  return Boolean(config.firecrawlApiKey);
}

async function fcRequest(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${config.firecrawlBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.firecrawlApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error || json?.message || res.statusText;
    throw new Error(`Firecrawl ${path} failed (${res.status}): ${msg}`);
  }
  return json;
}

/** v2 search returns citations grouped under data.web (url, title, description). */
export async function firecrawlSearch(query: string, limit = 5): Promise<SearchResult[]> {
  const json = await fcRequest("/search", { query, limit, sources: ["web"] });
  const web: unknown = json?.data?.web;
  if (!Array.isArray(web)) return [];
  return web
    .filter((r: any) => r && typeof r.url === "string")
    .map((r: any) => ({
      url: r.url,
      title: r.title ?? "",
      snippet: r.description ?? r.snippet ?? "",
    }));
}

/** v2 scrape is synchronous - returns data.markdown directly. */
export async function firecrawlScrape(url: string): Promise<ScrapedPage | null> {
  const json = await fcRequest("/scrape", {
    url,
    formats: ["markdown"],
    onlyMainContent: true,
  });
  const markdown: unknown = json?.data?.markdown;
  if (typeof markdown !== "string" || !markdown.trim()) return null;
  return { url, markdown };
}

/** Firecrawl includes og:image straight in scrape metadata - no manual HTML parsing needed. */
export async function firecrawlOgImage(url: string): Promise<string | null> {
  const json = await fcRequest("/scrape", { url, formats: ["markdown"], onlyMainContent: true });
  const meta = json?.data?.metadata;
  const image = meta?.ogImage ?? meta?.["og:image"] ?? null;
  return typeof image === "string" && image.trim() ? image : null;
}
