import { config } from "./config.js";
import { recordProviderCall } from "./ai/gateway.js";
import { fetchWithRetry } from "./http.js";
import type { SearchResult, ScrapedPage } from "./anakin.js";

/** Firecrawl is only used as a fallback and only when an API key is configured. */
export function firecrawlEnabled(): boolean {
  return Boolean(config.firecrawlApiKey);
}

async function fcRequest(
  path: string,
  body: unknown,
  method: "POST" | "GET" | "DELETE" | "PUT" = "POST"
): Promise<any> {
  const start = Date.now();
  const res = await fetchWithRetry(
    `${config.firecrawlBaseUrl}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${config.firecrawlApiKey}`,
        ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body),
    },
    { timeoutMs: config.providerHttpTimeoutMs, retries: config.providerHttpRetries }
  );
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error || json?.message || res.statusText;
    recordProviderCall({
      kind: "research",
      workload: `firecrawl:${method.toLowerCase()}:${path}`,
      provider: "firecrawl",
      latencyMs: Date.now() - start,
      ok: false,
      error: msg,
    });
    throw new Error(`Firecrawl ${path} failed (${res.status}): ${msg}`);
  }
  recordProviderCall({
    kind: "research",
    workload: `firecrawl:${method.toLowerCase()}:${path}`,
    provider: "firecrawl",
    latencyMs: Date.now() - start,
    ok: true,
  });
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

/** Raw HTML fallback for meta tags Firecrawl doesn't normalize (e.g. product:price:amount). */
export async function firecrawlScrapeHtml(url: string): Promise<string | null> {
  const json = await fcRequest("/scrape", { url, formats: ["html"], onlyMainContent: false });
  const html: unknown = json?.data?.html;
  return typeof html === "string" && html.trim() ? html : null;
}

const PRODUCT_EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    brand: { type: "string" },
    model: { type: "string" },
    price: { type: "string" },
    currency: { type: "string" },
    gtin: { type: "string" },
    upc: { type: "string" },
    ean: { type: "string" },
    seller: { type: "string" },
    inStock: { type: "boolean" },
    imageUrl: { type: "string" },
    description: { type: "string" },
  },
};

/** Schema-based structured extract - used when markdown scrape lacks price/specs. */
export async function firecrawlExtract(
  url: string,
  opts: {
    proxy?: "basic" | "enhanced" | "auto";
    location?: { country: string; languages?: string[] };
  } = {}
): Promise<{
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  price?: string | null;
  currency?: string | null;
  gtin?: string | null;
  upc?: string | null;
  ean?: string | null;
  seller?: string | null;
  inStock?: boolean | null;
  imageUrl?: string | null;
  description?: string | null;
} | null> {
  const json = await fcRequest("/scrape", {
    url,
    formats: [
      {
        type: "json",
        schema: PRODUCT_EXTRACT_SCHEMA,
        prompt: "Extract product title, brand, model, price, currency, GTIN/UPC/EAN, seller, stock, image URL.",
      },
    ],
    onlyMainContent: true,
    ...(opts.proxy ? { proxy: opts.proxy } : {}),
    ...(opts.location ? { location: opts.location } : {}),
  });
  const data = json?.data?.json ?? json?.data?.extract ?? null;
  if (!data || typeof data !== "object") return null;
  return data;
}

/** Fields we care about for price/stock change tracking on product pages. */
export const PRICE_STOCK_TRACKING_SCHEMA = {
  type: "object",
  properties: {
    price: { type: "string" },
    currency: { type: "string" },
    inStock: { type: "boolean" },
    seller: { type: "string" },
    title: { type: "string" },
  },
};

export type FirecrawlMonitor = {
  id: string;
  name?: string;
  status?: string;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  [key: string]: unknown;
};

export type CreatePriceMonitorInput = {
  name: string;
  urls: string[];
  /** Cron or natural language schedule text. Default hourly. */
  schedule?: { cron?: string; text?: string; timezone?: string };
  goal?: string;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  metadata?: Record<string, string>;
};

/** Build v2 /monitor body for product price+stock page watches (JSON change tracking). */
export function buildPriceStockMonitorBody(input: CreatePriceMonitorInput): Record<string, unknown> {
  const urls = input.urls.filter((u) => typeof u === "string" && u.startsWith("http")).slice(0, 50);
  if (urls.length === 0) throw new Error("At least one http(s) URL required");

  const body: Record<string, unknown> = {
    name: input.name.slice(0, 120),
    schedule: input.schedule ?? { text: "hourly", timezone: "UTC" },
    goal:
      input.goal ??
      "Alert when listed price drops, seller changes, or stock status flips between in-stock and out-of-stock.",
    targets: [
      {
        type: "scrape",
        urls,
        scrapeOptions: {
          formats: [
            {
              type: "changeTracking",
              modes: ["json"],
              prompt: "Extract current listed price, currency, in-stock flag, seller, and product title.",
              schema: PRICE_STOCK_TRACKING_SCHEMA,
            },
          ],
        },
      },
    ],
  };

  if (input.webhookUrl) {
    body.webhook = {
      url: input.webhookUrl,
      headers: input.webhookHeaders ?? {},
      metadata: input.metadata ?? {},
      events: ["monitor.page", "monitor.check.completed"],
    };
  }

  return body;
}

export async function firecrawlCreateMonitor(
  input: CreatePriceMonitorInput
): Promise<FirecrawlMonitor> {
  if (!firecrawlEnabled()) throw new Error("Firecrawl not configured");
  const json = await fcRequest("/monitor", buildPriceStockMonitorBody(input));
  const data = json?.data ?? json;
  if (!data?.id) throw new Error("Firecrawl create monitor returned no id");
  return data as FirecrawlMonitor;
}

export async function firecrawlGetMonitor(monitorId: string): Promise<FirecrawlMonitor | null> {
  if (!firecrawlEnabled()) return null;
  const json = await fcRequest(`/monitor/${encodeURIComponent(monitorId)}`, undefined, "GET");
  return (json?.data ?? json) as FirecrawlMonitor;
}

export async function firecrawlDeleteMonitor(monitorId: string): Promise<void> {
  if (!firecrawlEnabled()) return;
  await fcRequest(`/monitor/${encodeURIComponent(monitorId)}`, undefined, "DELETE");
}

export async function firecrawlRunMonitor(monitorId: string): Promise<unknown> {
  if (!firecrawlEnabled()) throw new Error("Firecrawl not configured");
  return fcRequest(`/monitor/${encodeURIComponent(monitorId)}/run`, {});
}

/** Soft-disabled helper: returns null when Firecrawl key unset. */
export async function tryCreatePriceStockMonitor(
  input: CreatePriceMonitorInput
): Promise<FirecrawlMonitor | null> {
  if (!firecrawlEnabled()) return null;
  return firecrawlCreateMonitor(input);
}
