import type { ProductIdentity } from "../schema.js";
import {
  currencyFor,
  deeplinkOnlyMarketplacesFor,
  findMarketplace,
  manualUrlFor,
  normalizeCountry,
  priceRegexFor,
  scrapeMarketplacesFor,
  type Country,
  type Marketplace,
} from "../marketplaces/registry.js";
import { matchScore, normalizeOffer, type MarketplaceOffer, type ReferencePrice } from "../marketplaces/normalize.js";
import { CreditTracker, orchestratedExtract, orchestratedSearchMany } from "../providers/orchestrator.js";
import { findOrCreateProduct } from "./../repositories/products.js";
import { getFreshOffers, upsertOffers } from "../repositories/offers.js";
import { dbAvailable } from "../db/client.js";
import { productFingerprint } from "../db/fingerprint.js";

const MIN_MATCH = 0.35;
const inflight = new Map<string, Promise<MarketplaceOffer[]>>();

export interface CompareResult {
  offers: MarketplaceOffer[];
  productId: string | null;
  cached: boolean;
}

/** Approximate user location (from device GPS) - optional, additive. Used only
 *  to give Firecrawl explicit IN geography when scraping locationAware
 *  marketplaces (Blinkit/BigBasket); never required, never blocks the request. */
export interface UserLocation {
  lat: number;
  lon: number;
}

/**
 * The user's own current-listing offer is never trustworthy from a fresh/cached
 * re-scrape - a re-scrape of "the same platform" can disagree with what's on the
 * user's screen right now (stale cache, wrong variant, different currency). When
 * a candidate offer's retailerId matches the reference platform, force its price
 * to the live reference price instead and flag it so downstream deal-ranking
 * never treats it as a distinct "better" offer. Runs on every compareProduct
 * return path (in-flight/db-cache/live) via a fresh mapped array, so concurrent
 * callers sharing a cached offer list never see each other's reference override.
 */
export function applyReferenceGuard(
  offers: MarketplaceOffer[],
  reference: ReferencePrice | null | undefined
): MarketplaceOffer[] {
  if (!reference || !reference.retailerId) return offers;
  return offers.map((o) => {
    if (o.retailerId !== reference.retailerId) return o;
    return {
      ...o,
      price: reference.amount,
      currency: reference.currency,
      isCurrentListing: true,
    };
  });
}

export async function compareProduct(
  product: ProductIdentity,
  opts: {
    gtin?: string | null;
    country?: Country | string | null;
    location?: UserLocation | null;
    reference?: ReferencePrice | null;
  } = {}
): Promise<CompareResult> {
  const country = normalizeCountry(opts.country);
  // Location doesn't change which offers are cached/returned (we don't cache
  // per-location), only how locationAware marketplaces are scraped live - so it
  // isn't part of the in-flight/cache fingerprint. Same for reference: it's a
  // request-scoped override applied post-hoc below, never part of what's cached.
  const fp = `${productFingerprint(product)}:${country}`;
  const existing = inflight.get(fp);
  if (existing) {
    const offers = await existing;
    return { offers: applyReferenceGuard(offers, opts.reference), productId: null, cached: true };
  }

  const promise = executeCompare(product, opts.gtin ?? null, country, opts.location ?? null);
  inflight.set(fp, promise.then((r) => r.offers));
  try {
    const result = await promise;
    return { ...result, offers: applyReferenceGuard(result.offers, opts.reference) };
  } finally {
    inflight.delete(fp);
  }
}

async function executeCompare(
  product: ProductIdentity,
  gtin: string | null,
  country: Country,
  location: UserLocation | null
): Promise<CompareResult> {
  let productId: string | null = null;

  if (dbAvailable()) {
    try {
      const row = await findOrCreateProduct(product);
      productId = row.id;
      const cached = await getFreshOffers(row.id);
      if (cached && cached.length > 0) {
        const currency = currencyFor(country);
        const filtered = cached.filter((o) => !o.currency || o.currency === currency);
        if (filtered.length > 0) {
          return { offers: filtered, productId, cached: true };
        }
      }
    } catch (err) {
      console.warn("[compare] cache read failed:", (err as Error).message);
    }
  }

  const offers = await liveCompare(product, gtin, country, location);

  if (productId && offers.length > 0) {
    await upsertOffers(productId, offers).catch((err) =>
      console.warn("[compare] cache write failed:", (err as Error).message)
    );
  }

  return { offers, productId, cached: false };
}

async function liveCompare(
  product: ProductIdentity,
  gtin: string | null,
  country: Country,
  location: UserLocation | null
): Promise<MarketplaceOffer[]> {
  const tracker = new CreditTracker();
  const term = product.searchTerm || product.name;
  const brand = product.brand ? ` ${product.brand}` : "";
  // Only scrape-capable marketplaces get live search/extract attempts - deeplinkOnly
  // platforms (app-only, signed/session-gated, aggressive anti-bot) never burn a
  // request that would just produce stale/wrong prices.
  const list = scrapeMarketplacesFor(country);
  const defaultCurrency = currencyFor(country);
  const priceRe = priceRegexFor(country);

  const priority = list.slice(0, 10);
  const tasks = priority.map((m) => ({
    type: m.id,
    prompt: `site:${m.domains[0]} ${term}${brand}${product.model ? ` ${product.model}` : ""} buy price`,
    minResults: 1,
  }));

  const grouped = await orchestratedSearchMany(tasks, tracker, { limit: 4, timeoutMs: 10000 });
  const candidates: { url: string; title: string; snippet: string; marketplaceId: string }[] = [];

  for (const g of grouped) {
    for (const r of g.results.slice(0, 2)) {
      const m = findMarketplace(r.url, country);
      if (!m || !list.some((x) => x.id === m.id)) continue;
      candidates.push({
        url: r.url,
        title: r.title || term,
        snippet: r.snippet || "",
        marketplaceId: m.id,
      });
    }
  }

  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    try {
      const u = new URL(c.url);
      const key = u.hostname + u.pathname;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    } catch {
      return false;
    }
  });

  const top = unique.slice(0, 8);
  const enriched = await Promise.all(
    top.map(async (c) => {
      const m = list.find((x) => x.id === c.marketplaceId)!;
      const structured = await orchestratedExtract(c.url, {
        proxy: m.antiBotStealth ? "enhanced" : undefined,
        // Firecrawl defaults to US geography - explicit IN context for
        // locationAware platforms once the user has granted location, instead
        // of just relying on country-level defaults. Pincode-level dark-store
        // accuracy isn't reachable this way (Blinkit/BigBasket gate that behind
        // an interactive location picker), but this at least avoids a
        // US-flavored scrape of an India-only site.
        location: m.locationAware && location ? { country: "IN", languages: ["en"] } : undefined,
      }).catch(() => null);
      const title = structured?.title || c.title;
      const match = matchScore({
        productName: product.name,
        productBrand: product.brand,
        productModel: product.model,
        productGtin: gtin,
        candidateTitle: title,
        candidateGtin: structured?.gtin || structured?.ean || structured?.upc || null,
      });

      if (match.score < MIN_MATCH) return null;

      const priceRaw =
        structured?.price ||
        c.snippet.match(priceRe)?.[0] ||
        null;

      return normalizeOffer({
        retailer: m.name,
        retailerId: m.id,
        url: c.url,
        title,
        priceRaw,
        currency: structured?.currency ?? null,
        defaultCurrency,
        seller: structured?.seller ?? null,
        inStock: structured?.inStock ?? null,
        matchScore: match.score,
        matchReason: match.reason,
      });
    })
  );

  const liveOffers = enriched
    .filter((o): o is MarketplaceOffer => o !== null)
    .sort((a, b) => {
      if (a.price != null && b.price != null) return a.price - b.price;
      if (a.price != null) return -1;
      if (b.price != null) return 1;
      return b.matchScore - a.matchScore;
    });

  return [...liveOffers, ...manualCheckOffers(product, country, defaultCurrency)];
}

/** deeplinkOnly platforms never get a scrape attempt - surface as "check manually"
 *  entries with no price data (never fabricate a price). Only shown for products
 *  in a category the platform actually sells (quick-commerce = grocery), so a
 *  phone doesn't get a bogus "check manually on Milkbasket" entry. */
function manualCheckOffers(
  product: ProductIdentity,
  country: Country,
  defaultCurrency: string
): MarketplaceOffer[] {
  const category = product.category?.toLowerCase();
  return deeplinkOnlyMarketplacesFor(country)
    .filter(
      (m) => (m.categories as string[]).includes(category) || (m.categories as string[]).includes("general")
    )
    .map((m: Marketplace) =>
      normalizeOffer({
        retailer: m.name,
        retailerId: m.id,
        url: manualUrlFor(m, product.searchTerm || product.name),
        title: product.name,
        priceRaw: null,
        currency: null,
        defaultCurrency,
        matchScore: 0,
        matchReason: "check_manually",
        checkManually: true,
      })
    );
}
