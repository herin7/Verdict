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
    category: findMarketplace(url)?.category ?? "general",
    gtin,
    price,
    currency,
    searchTerm: cleanTitle?.slice(0, 120),
    confidence: cleanTitle ? 0.75 : 0.3,
    description,
  };
}

/**
 * Names that come from a blocked, bot-check or ad page instead of the product:
 * a bare domain ("veirdo.in", "aax-eu.amazon-adsystem.com") or a generic title.
 */
export function isJunkProductName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (n.length < 3) return true;
  if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+\/?$/i.test(n)) return true;
  return /^(amazon(\.\w+)*|flipkart|myntra|robot check|access denied|page not found|404|sign in|just a moment\.*|attention required.*)$/i.test(n);
}

function isSufficient(partial: PartialIdentity): boolean {
  return Boolean(partial.name && !isJunkProductName(partial.name) && (partial.confidence ?? 0) >= 0.55);
}

/**
 * Follows short share links (amzn.in/d/..., dl.flipkart.com/s/..., share.google/...)
 * to the real product URL, keeping the page HTML as a fallback source when the
 * scraper is blocked.
 */
async function fetchDirect(url: string): Promise<{ url: string; html: string | null }> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
        "Accept-Language": "en-IN,en;q=0.9",
        Accept: "text/html",
      },
    });
    const isHtml = res.ok && (res.headers.get("content-type") ?? "").includes("text/html");
    return { url: res.url || url, html: isHtml ? await res.text() : (await res.body?.cancel(), null) };
  } catch {
    return { url, html: null };
  }
}

/** "Amazon.in: Buy Logitech PRO X2 ... : Amazon.in: Electronics" gives "Logitech PRO X2 ...". */
export function cleanStoreTitle(title: string): string {
  return title
    .replace(/^(amazon\.\w+(\.\w+)?|flipkart(\.com)?)\s*:\s*(buy\s+)?/i, "")
    .replace(/\s*[:|-]\s*(amazon|flipkart|myntra)\b.*$/i, "")
    .replace(/\s+(online at (best|low) prices?.*|buy online.*)$/i, "")
    .trim();
}

/** amazon.in/Boat-Rockerz-450-Bluetooth-Headphones/dp/B07... gives "Boat Rockerz 450 Bluetooth Headphones". */
export function nameFromUrlSlug(url: string): string | null {
  const slug =
    url.match(/\/([^/?#]{8,})\/(?:dp|p|gp\/product)\/[\w-]+/i)?.[1] ?? // amazon, flipkart
    url.match(/\/products\/([^/?#]{8,})/i)?.[1]; // shopify stores
  if (!slug) return null;
  const name = decodeURIComponent(slug).replace(/[-_+]+/g, " ").trim();
  return name.split(" ").length >= 2 ? name : null;
}

/** Store boilerplate off the name; the search term keeps only the core product ("X, with Y, ..." gives "X"). */
function withCleanName(partial: PartialIdentity): PartialIdentity {
  if (!partial.name) return partial;
  const name = cleanStoreTitle(partial.name);
  const searchTerm = name.split(/,|\s[|(]|\swith\s/i)[0].trim().slice(0, 100) || name;
  return { ...partial, name, searchTerm };
}

function deterministicResult(partial: PartialIdentity, url: string, marketplaceId: string | null): UrlIdentifyResult {
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
  const structured = { gtin: partial.gtin ?? null, price: partial.price ?? null, currency: partial.currency ?? null, marketplaceId };
  return { product, sourceUrl: url, marketplaceId, method: "deterministic", structured };
}

/**
 * Identify product from marketplace URL. Deterministic metadata/JSON-LD first;
 * LLM only if extraction is insufficient.
 */
export async function identifyFromUrl(sharedUrl: string): Promise<UrlIdentifyResult> {
  const direct = await fetchDirect(sharedUrl);
  const url = direct.url;
  const marketplace = findMarketplace(url);

  // Fast path: most store pages name the product in their own HTML, so the
  // scraper (~15 s) is only needed when that page is blocked or unhelpful.
  if (direct.html) {
    const quick = withCleanName(deterministicFromHtml(url, direct.html));
    if (isSufficient(quick)) return deterministicResult(quick, url, marketplace?.id ?? null);
  }

  const [scraperHtml, structured] = await Promise.all([fetchHtml(url), orchestratedExtract(url)]);
  const html = scraperHtml ?? direct.html;

  const scraped = await orchestratedScrape([url], { oneTimeoutMs: 12000 });
  const page: ScrapedPage | undefined = scraped.get(url);

  let partial: PartialIdentity = {};
  if (html) partial = { ...partial, ...deterministicFromHtml(url, html) };
  if (isJunkProductName(partial.name) && direct.html && direct.html !== html) {
    partial = { ...partial, ...deterministicFromHtml(url, direct.html) };
  }
  partial = withCleanName(partial);

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

  // A blocked page gives a junk title; the product URL's slug is more reliable.
  const slugName = nameFromUrlSlug(url);
  if (slugName && (!partial.name || isJunkProductName(partial.name))) {
    partial = { ...partial, name: slugName, searchTerm: slugName, confidence: Math.max(partial.confidence ?? 0, 0.7) };
  }
  if (isJunkProductName(partial.name)) partial = { ...partial, name: undefined };

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

  if (isSufficient(partial)) return deterministicResult(partial, url, marketplace?.id ?? null);

  const llmProduct = await callToolIdentifyFromText({
    url,
    title: partial.name ?? null,
    brand: typeof partial.brand === "string" ? partial.brand : null,
    markdownSnippet: page?.markdown?.slice(0, 4000) ?? null,
    description: partial.description ?? null,
    gtin: typeof partial.gtin === "string" ? partial.gtin : null,
  });
  // The model can still echo a domain from a blocked page; treat that as "not identified".
  const product = isJunkProductName(llmProduct.name) ? { ...llmProduct, confidence: 0 } : llmProduct;

  return {
    product,
    sourceUrl: url,
    marketplaceId: marketplace?.id ?? null,
    method: "llm",
    structured: structuredOut,
  };
}
