import type { ScrapedPage } from "../providers/types.js";
import { orchestratedExtract, orchestratedScrape } from "../providers/orchestrator.js";
import { firecrawlEnabled, firecrawlScrapeHtml } from "../firecrawl.js";
import { findMarketplace } from "../marketplaces/registry.js";
import { coerceStructuredPrice } from "../marketplaces/normalize.js";
import { ProductIdentitySchema, requireProductIdentity, type ProductIdentity } from "../schema.js";
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

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Prefer sale/current price from Offer / AggregateOffer / priceSpecification. */
function priceFromOffers(offers: unknown): { price: string | null; currency: string | null; fieldPath: string } {
  if (!offers) return { price: null, currency: null, fieldPath: "offers.price" };
  const list = Array.isArray(offers) ? offers : [offers];
  for (const item of list) {
    const rec = asRecord(item);
    if (!rec) continue;
    const types = Array.isArray(rec["@type"]) ? rec["@type"] : [rec["@type"]];
    const isAgg = types.some((t) => String(t || "").toLowerCase().includes("aggregateoffer"));

    const spec = rec.priceSpecification;
    if (spec) {
      const specs = Array.isArray(spec) ? spec : [spec];
      let sale: { price: string; currency: string | null; fieldPath: string } | null = null;
      let fallback: { price: string; currency: string | null; fieldPath: string } | null = null;
      for (const s of specs) {
        const sr = asRecord(s);
        if (!sr) continue;
        const name = String(sr.name ?? sr["@type"] ?? "").toLowerCase();
        if (/list|mrp|strikethrough|was/.test(name)) continue;
        const price = sr.price ?? sr.minPrice;
        const currency = sr.priceCurrency ?? rec.priceCurrency;
        if (price == null) continue;
        const entry = {
          price: String(price),
          currency: typeof currency === "string" ? currency : null,
          fieldPath: /sale|deal|current/.test(name) ? "priceSpecification.sale" : "priceSpecification.price",
        };
        if (/sale|deal|current|unit/.test(name)) sale = entry;
        else fallback = fallback ?? entry;
      }
      if (sale || fallback) return sale ?? fallback!;
    }

    const price = isAgg ? (rec.lowPrice ?? rec.price) : (rec.price ?? rec.lowPrice);
    const currency = rec.priceCurrency;
    if (price != null) {
      return {
        price: String(price),
        currency: typeof currency === "string" ? currency : null,
        fieldPath: isAgg ? "offers.lowPrice" : "offers.price",
      };
    }
  }
  return { price: null, currency: null, fieldPath: "offers.price" };
}

function validatedPrice(
  raw: string | null | undefined,
  currency: string | null | undefined,
  fieldPath = "price",
  context?: string | null
): { price: string | null; currency: string | null } {
  if (raw == null || String(raw).trim() === "") return { price: null, currency: null };
  const coerced = coerceStructuredPrice(raw, currency ?? null, "INR", {
    fieldPath,
    context: context ?? String(raw),
  });
  if (coerced.amount != null) {
    return { price: String(coerced.amount), currency: coerced.currency };
  }
  return { price: null, currency: null };
}

async function fetchHtml(url: string): Promise<string | null> {
  if (!firecrawlEnabled()) return null;
  try {
    return await firecrawlScrapeHtml(url);
  } catch {
    return null;
  }
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

  const fromLd = priceFromOffers(ld.offers);
  const metaAmount = metaContent(html, ["product:price:amount", "og:price:amount"]);
  const metaCurrency = metaContent(html, ["product:price:currency", "og:price:currency"]);
  const rawPrice = fromLd.price || metaAmount || null;
  const rawCurrency = fromLd.currency || metaCurrency || null;
  const validated = validatedPrice(
    rawPrice,
    rawCurrency,
    fromLd.price ? fromLd.fieldPath : "meta.price",
    rawPrice
  );
  const price = validated.price;
  const currency = validated.currency;

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

  const [html, structured] = await Promise.all([fetchHtml(url), orchestratedExtract(url)]);

  const scraped = await orchestratedScrape([url], { oneTimeoutMs: 12000 });
  const page: ScrapedPage | undefined = scraped.get(url);

  let partial: PartialIdentity = {};
  if (html) partial = { ...partial, ...deterministicFromHtml(url, html) };

  if (structured) {
    const fromExtract = validatedPrice(structured.price, structured.currency);
    partial = {
      ...partial,
      name: partial.name || structured.title || undefined,
      brand: partial.brand ?? structured.brand ?? null,
      model: partial.model ?? structured.model ?? null,
      searchTerm: partial.searchTerm || structured.title || undefined,
      confidence: Math.max(partial.confidence ?? 0, structured.title ? 0.8 : 0),
      gtin: partial.gtin || structured.gtin || structured.ean || structured.upc || null,
      price: partial.price || fromExtract.price || null,
      currency: partial.currency || fromExtract.currency || null,
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
    const product = requireProductIdentity(
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
