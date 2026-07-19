import {
  coerceStructuredPrice,
  StructuredProductDataSchema,
  type StructuredProductData as ValidatedStructured,
} from "./marketplaces/normalize.js";
import { config } from "./config.js";
import { recordProviderCall } from "./ai/gateway.js";
import { fetchWithRetry } from "./http.js";
import type { SearchResult, ScrapedPage } from "./providers/types.js";
import type { StructuredProductData } from "./providers/types.js";

/** Firecrawl is the sole research provider - only gated on an API key being configured. */
export function firecrawlEnabled(): boolean {
  return Boolean(config.firecrawlApiKey);
}

async function fcRequest(
  path: string,
  body: unknown,
  method: "POST" | "GET" | "DELETE" | "PUT" = "POST",
  signal?: AbortSignal
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
      signal,
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
export async function firecrawlSearch(query: string, limit = 5, signal?: AbortSignal): Promise<SearchResult[]> {
  const json = await fcRequest("/search", { query, limit, sources: ["web"] }, "POST", signal);
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
export async function firecrawlScrape(url: string, signal?: AbortSignal): Promise<ScrapedPage | null> {
  const json = await fcRequest(
    "/scrape",
    { url, formats: ["markdown"], onlyMainContent: true },
    "POST",
    signal
  );
  const markdown: unknown = json?.data?.markdown;
  if (typeof markdown !== "string" || !markdown.trim()) return null;
  return { url, markdown };
}

/** Firecrawl includes og:image straight in scrape metadata - no manual HTML parsing needed. */
export async function firecrawlOgImage(url: string, signal?: AbortSignal): Promise<string | null> {
  const json = await fcRequest(
    "/scrape",
    { url, formats: ["markdown"], onlyMainContent: true },
    "POST",
    signal
  );
  const meta = json?.data?.metadata;
  const image = meta?.ogImage ?? meta?.["og:image"] ?? null;
  return typeof image === "string" && image.trim() ? image : null;
}

/** Raw HTML fallback for meta tags Firecrawl doesn't normalize (e.g. product:price:amount). */
export async function firecrawlScrapeHtml(url: string, signal?: AbortSignal): Promise<string | null> {
  const json = await fcRequest("/scrape", { url, formats: ["html"], onlyMainContent: false }, "POST", signal);
  const html: unknown = json?.data?.html;
  return typeof html === "string" && html.trim() ? html : null;
}

/**
 * Firecrawl's browser-actions API (verified against docs.firecrawl.dev/api-reference/endpoint/scrape
 * and the advanced-scraping-guide - actions run sequentially, up to 50 per
 * request). Only the subset this app actually uses is modeled here; the full
 * API also has screenshot/scrape/executeJavascript/pdf action types.
 */
export type FirecrawlAction =
  | { type: "wait"; milliseconds?: number; selector?: string }
  | { type: "click"; selector: string; all?: boolean }
  | { type: "write"; text: string }
  | { type: "press"; key: string }
  | { type: "scroll"; direction?: "up" | "down"; selector?: string };

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

const PRODUCT_JSON_PROMPT =
  "Extract ONLY the current payable product price for this listing (the amount a buyer pays now). " +
  "Never use ratings, review counts, star scores, EMI/month amounts, coupon thresholds, cashback, " +
  "recommended products, or MRP when a sale/deal price is shown. Prefer sale price over MRP/list price. " +
  "Include currency as INR or USD. Also extract title, brand, model, GTIN/UPC/EAN, seller, stock, image URL.";

function pickVariantPrice(product: Record<string, unknown>): {
  price: string | null;
  currency: string | null;
  inStock: boolean | null;
  imageUrl: string | null;
  gtin: string | null;
} {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const first = variants.find((v) => v && typeof v === "object") as Record<string, unknown> | undefined;
  const price =
    (first?.price != null ? String(first.price) : null) ||
    (product.price != null ? String(product.price) : null) ||
    (product.currentPrice != null ? String(product.currentPrice) : null);
  const currency =
    (typeof first?.currency === "string" ? first.currency : null) ||
    (typeof product.currency === "string" ? product.currency : null);
  const availability = typeof first?.availability === "string" ? first.availability.toLowerCase() : "";
  const inStock =
    typeof product.inStock === "boolean"
      ? product.inStock
      : availability
        ? !/out|unavailable|sold/.test(availability)
        : null;
  const images = Array.isArray(first?.images) ? first.images : Array.isArray(product.images) ? product.images : [];
  const imageUrl =
    (typeof images[0] === "string" ? images[0] : null) ||
    (typeof product.imageUrl === "string" ? product.imageUrl : null) ||
    (typeof product.image === "string" ? product.image : null);
  const gtin =
    (typeof first?.gtin === "string" ? first.gtin : null) ||
    (typeof product.gtin === "string" ? product.gtin : null) ||
    (typeof product.sku === "string" ? product.sku : null);
  return { price, currency, inStock, imageUrl, gtin };
}

function mapProductFormat(raw: unknown): StructuredProductData | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const product = (root.product && typeof root.product === "object" ? root.product : root) as Record<
    string,
    unknown
  >;
  const picked = pickVariantPrice(product);
  const coerced = coerceStructuredPrice(picked.price, picked.currency);
  const candidate = {
    title: typeof product.title === "string" ? product.title : typeof product.name === "string" ? product.name : null,
    brand: typeof product.brand === "string" ? product.brand : null,
    model: typeof product.model === "string" ? product.model : null,
    // Only pass price if it survived validation — otherwise leave null (never ship ratings)
    price: coerced.amount != null ? String(coerced.amount) : null,
    currency: coerced.amount != null ? coerced.currency : picked.currency,
    gtin: picked.gtin,
    upc: typeof product.upc === "string" ? product.upc : null,
    ean: typeof product.ean === "string" ? product.ean : null,
    seller: typeof product.seller === "string" ? product.seller : null,
    inStock: picked.inStock,
    imageUrl: picked.imageUrl,
    description: typeof product.description === "string" ? product.description : null,
  };
  const parsed = StructuredProductDataSchema.safeParse(candidate);
  if (!parsed.success) return null;
  return toProviderShape(parsed.data);
}

function mapJsonExtract(raw: unknown): StructuredProductData | null {
  const parsed = StructuredProductDataSchema.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data;
  const coerced = coerceStructuredPrice(data.price ?? null, data.currency ?? null);
  return toProviderShape({
    ...data,
    price: coerced.amount != null ? String(coerced.amount) : null,
    currency: coerced.amount != null ? coerced.currency : data.currency ?? null,
  });
}

function toProviderShape(data: ValidatedStructured): StructuredProductData {
  return {
    title: data.title ?? null,
    brand: data.brand ?? null,
    model: data.model ?? null,
    price: data.price != null ? String(data.price) : null,
    currency: data.currency ?? null,
    gtin: data.gtin ?? null,
    upc: data.upc ?? null,
    ean: data.ean ?? null,
    seller: data.seller ?? null,
    inStock: data.inStock ?? null,
    imageUrl: data.imageUrl ?? null,
    description: data.description ?? null,
  };
}

/** Prefer Firecrawl deterministic `product` format; fall back to schema JSON. Always Zod-validated. */
export async function firecrawlExtract(
  url: string,
  opts: {
    proxy?: "basic" | "enhanced" | "auto";
    location?: { country: string; languages?: string[] };
    actions?: FirecrawlAction[];
  } = {},
  signal?: AbortSignal
): Promise<StructuredProductData | null> {
  const common = {
    url,
    onlyMainContent: true,
    ...(opts.proxy ? { proxy: opts.proxy } : {}),
    ...(opts.location ? { location: opts.location } : {}),
    ...(opts.actions?.length ? { actions: opts.actions } : {}),
  };

  // One request: product format (cheap/deterministic) + json schema fallback fields
  const json = await fcRequest(
    "/scrape",
    {
      ...common,
      formats: [
        "product",
        {
          type: "json",
          schema: PRODUCT_EXTRACT_SCHEMA,
          prompt: PRODUCT_JSON_PROMPT,
        },
      ],
    },
    "POST",
    signal
  );

  const fromProduct = mapProductFormat(json?.data?.product ?? json?.data);
  if (fromProduct?.price) return fromProduct;

  const fromJson = mapJsonExtract(json?.data?.json ?? json?.data?.extract ?? null);
  if (fromJson?.price) return fromJson;

  // Prefer whichever has a title even without price (manual check path still useful)
  return fromProduct ?? fromJson;
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
