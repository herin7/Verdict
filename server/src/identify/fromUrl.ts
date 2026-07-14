import type { ScrapedPage } from "../anakin.js";
import { CreditTracker, orchestratedExtract, orchestratedScrape } from "../providers/orchestrator.js";
import { scrapeHtml } from "../anakin.js";
import { firecrawlEnabled, firecrawlScrapeHtml } from "../firecrawl.js";
import { findMarketplace } from "../marketplaces/registry.js";
import { ProductIdentitySchema, type ProductIdentity } from "../schema.js";
import { coerceToSchema } from "../coerce.js";
import { callToolIdentifyFromText } from "./llmFallback.js";

export interface UrlIdentifyStructured {
  gtin: string | null;
  price: string | null;
  currency: string | null;
  marketplaceId: string | null;
}

export interface UrlIdentifyResult {
  product: ProductIdentity;
  sourceUrl: string;
  marketplaceId: string | null;
  method: "deterministic" | "llm";
  structured: UrlIdentifyStructured;
}

const GTIN_RE = /\b(\d{8}|\d{12}|\d{13}|\d{14})\b/;
const PRICE_RE = /(?:₹|Rs\.?|INR|\$|USD)\s*([\d,]+(?:\.\d{1,2})?)/i;

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const prop = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );
    const prop2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      "i"
    );
    const m = html.match(prop) || html.match(prop2);
    if (m?.[1]) return decodeHtml(m[1].trim());
  }
  return null;
}

function extractJsonLdProducts(html: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const t = (item as { "@type"?: string | string[] })["@type"];
        const types = Array.isArray(t) ? t : [t];
        if (types.some((x) => String(x).toLowerCase().includes("product"))) {
          blocks.push(item as Record<string, unknown>);
        }
        const graph = (item as { "@graph"?: unknown[] })["@graph"];
        if (Array.isArray(graph)) {
          for (const g of graph) {
            if (!g || typeof g !== "object") continue;
            const gt = (g as { "@type"?: string | string[] })["@type"];
            const gtypes = Array.isArray(gt) ? gt : [gt];
            if (gtypes.some((x) => String(x).toLowerCase().includes("product"))) {
              blocks.push(g as Record<string, unknown>);
            }
          }
        }
      }
    } catch {
      // ignore bad JSON-LD
    }
  }
  return blocks;
}

function pickGtin(obj: Record<string, unknown>): string | null {
  for (const k of ["gtin13", "gtin12", "gtin8", "gtin14", "gtin", "sku", "productID", "mpn"]) {
    const v = obj[k];
    if (typeof v === "string" && GTIN_RE.test(v)) return v.match(GTIN_RE)![1];
  }
  return null;
}

function priceFromOffers(offers: unknown): { price: string | null; currency: string | null } {
  if (!offers) return { price: null, currency: null };
  const o = Array.isArray(offers) ? offers[0] : offers;
  if (!o || typeof o !== "object") return { price: null, currency: null };
  const rec = o as Record<string, unknown>;
  const price = rec.price ?? rec.lowPrice;
  const currency = rec.priceCurrency;
  return {
    price: price != null ? String(price) : null,
    currency: typeof currency === "string" ? currency : null,
  };
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const html = await scrapeHtml(url, { timeoutMs: 15000 });
    if (html?.trim()) return html;
  } catch {
    // fall through
  }
  if (firecrawlEnabled()) {
    try {
      return await firecrawlScrapeHtml(url);
    } catch {
      return null;
    }
  }
  return null;
}

interface PartialIdentity {
  name?: string;
  brand?: string | null;
  model?: string | null;
  category?: string;
  confidence?: number;
  searchTerm?: string;
  gtin?: string | null;
  price?: string | null;
  currency?: string | null;
  description?: string | null;
}

function deterministicFromHtml(url: string, html: string): PartialIdentity {
  const ld = extractJsonLdProducts(html)[0] ?? {};
  const title =
    (typeof ld.name === "string" ? ld.name : null) ||
    metaContent(html, ["og:title", "twitter:title"]) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    null;

  const brandRaw = ld.brand;
  let brand: string | null = null;
  if (typeof brandRaw === "string") brand = brandRaw;
  else if (brandRaw && typeof brandRaw === "object" && typeof (brandRaw as { name?: string }).name === "string") {
    brand = (brandRaw as { name: string }).name;
  } else {
    brand = metaContent(html, ["product:brand", "og:brand"]);
  }

  const { price: offerPrice, currency } = priceFromOffers(ld.offers);
  const price =
    offerPrice ||
    metaContent(html, ["product:price:amount", "og:price:amount"]) ||
    html.match(PRICE_RE)?.[1] ||
    null;

  const gtin = pickGtin(ld);
  const model =
    (typeof ld.model === "string" ? ld.model : null) ||
    (typeof ld.mpn === "string" ? ld.mpn : null) ||
    null;

  const description =
    (typeof ld.description === "string" ? ld.description : null) ||
    metaContent(html, ["og:description", "description"]);

  const cleanTitle = title ? decodeHtml(title).slice(0, 200) : undefined;

  return {
    name: cleanTitle,
    brand,
    model,
    category: findMarketplace(url)?.categories[0] ?? "general",
    gtin,
    price,
    currency,
    searchTerm: cleanTitle?.slice(0, 120),
    confidence: cleanTitle ? 0.75 : 0.3,
    description,
  };
}

function isSufficient(partial: PartialIdentity): boolean {
  return Boolean(partial.name && partial.name.length >= 3 && (partial.confidence ?? 0) >= 0.55);
}

/**
 * Identify product from marketplace URL. Deterministic metadata/JSON-LD first;
 * LLM only if extraction is insufficient.
 */
export async function identifyFromUrl(url: string): Promise<UrlIdentifyResult> {
  const marketplace = findMarketplace(url);
  const tracker = new CreditTracker();

  const [html, structured] = await Promise.all([fetchHtml(url), orchestratedExtract(url)]);

  const scraped = await orchestratedScrape([url], tracker, { oneTimeoutMs: 12000 });
  const page: ScrapedPage | undefined = scraped.get(url);

  let partial: PartialIdentity = {};
  if (html) partial = { ...partial, ...deterministicFromHtml(url, html) };

  if (structured) {
    partial = {
      ...partial,
      name: partial.name || structured.title || undefined,
      brand: partial.brand ?? structured.brand ?? null,
      model: partial.model ?? structured.model ?? null,
      searchTerm: partial.searchTerm || structured.title || undefined,
      confidence: Math.max(partial.confidence ?? 0, structured.title ? 0.8 : 0),
      gtin: partial.gtin || structured.gtin || structured.ean || structured.upc || null,
      price: partial.price || structured.price || null,
      currency: partial.currency || structured.currency || null,
    };
  }

  if (!partial.name && page?.markdown) {
    const firstLine = page.markdown.split("\n").find((l) => l.trim().length > 8);
    if (firstLine) {
      partial.name = firstLine.replace(/^#+\s*/, "").trim().slice(0, 200);
      partial.searchTerm = partial.name;
      partial.confidence = Math.max(partial.confidence ?? 0, 0.5);
    }
  }

  const structuredOut = {
    gtin: partial.gtin ?? null,
    price: partial.price ?? null,
    currency: partial.currency ?? null,
    marketplaceId: marketplace?.id ?? null,
  };

  if (isSufficient(partial)) {
    const product = ProductIdentitySchema.parse(
      coerceToSchema(ProductIdentitySchema, {
        name: partial.name,
        brand: partial.brand ?? null,
        category: partial.category ?? "general",
        model: partial.model ?? null,
        confidence: partial.confidence ?? 0.7,
        searchTerm: partial.searchTerm || partial.name,
      })
    );
    return {
      product,
      sourceUrl: url,
      marketplaceId: marketplace?.id ?? null,
      method: "deterministic",
      structured: structuredOut,
    };
  }

  const product = await callToolIdentifyFromText({
    url,
    title: partial.name ?? null,
    brand: typeof partial.brand === "string" ? partial.brand : null,
    markdownSnippet: page?.markdown?.slice(0, 4000) ?? null,
    description: partial.description ?? null,
    gtin: typeof partial.gtin === "string" ? partial.gtin : null,
  });

  return {
    product,
    sourceUrl: url,
    marketplaceId: marketplace?.id ?? null,
    method: "llm",
    structured: structuredOut,
  };
}
