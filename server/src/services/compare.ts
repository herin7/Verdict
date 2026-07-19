import type { ProductIdentity } from "../schema.js";
import {
  currencyFor,
  deeplinkOnlyMarketplacesFor,
  findMarketplace,
  manualUrlFor,
  normalizeCountry,
  priceRegexFor,
  scrapeMarketplacesForCategory,
  type Country,
  type Marketplace,
} from "../marketplaces/registry.js";
import {
  coerceStructuredPrice,
  filterOffersByCurrency,
  matchScore,
  normalizeOffer,
  parsePrice,
  type MarketplaceOffer,
  type ReferencePrice,
} from "../marketplaces/normalize.js";
import { orchestratedExtract, orchestratedSearchMany } from "../providers/orchestrator.js";
import { findOrCreateProduct } from "./../repositories/products.js";
import { getFreshOffers, upsertOffers } from "../repositories/offers.js";
import { dbAvailable } from "../db/client.js";
import { productFingerprint } from "../db/fingerprint.js";
import { backfillProductImageIfMissing } from "../productImage.js";

const MIN_MATCH = 0.35;
/** Cap extract concurrency/cost while still covering many marketplaces via round-robin. */
const MAX_EXTRACT = 10;
const inflight = new Map<string, Promise<MarketplaceOffer[]>>();

export interface CompareResult {
  offers: MarketplaceOffer[];
  productId: string | null;
  cached: boolean;
}

export interface UserLocation {
  lat: number;
  lon: number;
}

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

function locationScopeKey(location: UserLocation | null, pincode: string | null): string {
  if (pincode) return `pin:${pincode}`;
  if (location) return `geo:${location.lat.toFixed(2)},${location.lon.toFixed(2)}`;
  return "none";
}

/** Round-robin: one candidate per marketplace before seconds, then apply global cap. */
export function allocateCandidatesRoundRobin<T extends { marketplaceId: string }>(
  candidates: T[],
  max: number
): T[] {
  const byMarket = new Map<string, T[]>();
  for (const c of candidates) {
    const arr = byMarket.get(c.marketplaceId) ?? [];
    arr.push(c);
    byMarket.set(c.marketplaceId, arr);
  }
  const out: T[] = [];
  let round = 0;
  while (out.length < max) {
    let added = false;
    for (const [, arr] of byMarket) {
      if (round < arr.length) {
        out.push(arr[round]);
        added = true;
        if (out.length >= max) break;
      }
    }
    if (!added) break;
    round++;
  }
  return out;
}

export async function compareProduct(
  product: ProductIdentity,
  opts: {
    gtin?: string | null;
    country?: Country | string | null;
    location?: UserLocation | null;
    pincode?: string | null;
    reference?: ReferencePrice | null;
    onOffer?: (offer: MarketplaceOffer) => void;
  } = {}
): Promise<CompareResult> {
  const country = normalizeCountry(opts.country);
  const location = opts.location ?? null;
  const pincode = opts.pincode ?? null;
  const locationScoped = Boolean(pincode || location);
  const fp = `${productFingerprint(product)}:${country}:${locationScopeKey(location, pincode)}`;
  const existing = inflight.get(fp);
  if (existing) {
    const offers = await existing;
    return { offers: applyReferenceGuard(offers, opts.reference), productId: null, cached: true };
  }

  const promise = executeCompare(
    product,
    opts.gtin ?? null,
    country,
    location,
    pincode,
    locationScoped,
    opts.onOffer
  );
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
  location: UserLocation | null,
  pincode: string | null,
  locationScoped: boolean,
  onOffer?: (offer: MarketplaceOffer) => void
): Promise<CompareResult> {
  let productId: string | null = null;

  if (dbAvailable() && !locationScoped) {
    try {
      const row = await findOrCreateProduct(product);
      productId = row.id;
      backfillProductImageIfMissing(row.id, row.imageUrl, product);
      const cached = await getFreshOffers(row.id);
      if (cached && cached.length > 0) {
        const filtered = filterOffersByCurrency(cached, currencyFor(country));
        if (filtered.length > 0) {
          return { offers: filtered, productId, cached: true };
        }
      }
    } catch (err) {
      console.warn("[compare] cache read failed:", (err as Error).message);
    }
  } else if (dbAvailable() && locationScoped) {
    try {
      const row = await findOrCreateProduct(product);
      productId = row.id;
      backfillProductImageIfMissing(row.id, row.imageUrl, product);
    } catch {
      /* product id optional */
    }
  }

  const offers = await liveCompare(product, gtin, country, location, pincode, onOffer);

  if (productId && offers.length > 0 && !locationScoped) {
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
  location: UserLocation | null,
  pincode: string | null,
  onOffer?: (offer: MarketplaceOffer) => void
): Promise<MarketplaceOffer[]> {
  const term = product.searchTerm || product.name;
  const brand = product.brand ? ` ${product.brand}` : "";
  const list = scrapeMarketplacesForCategory(country, product.category);
  const defaultCurrency = currencyFor(country);
  const priceRe = priceRegexFor(country);

  const tasks = list
    .filter((m) => m.domains[0])
    .map((m) => ({
      type: m.id,
      prompt: `site:${m.domains[0]} ${term}${brand}${product.model ? ` ${product.model}` : ""} buy price`,
      minResults: 1,
    }));

  const grouped = await orchestratedSearchMany(tasks, { limit: 4, timeoutMs: 10000 });
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

  const top = allocateCandidatesRoundRobin(unique, MAX_EXTRACT);
  const enriched = await Promise.all(
    top.map(async (c) => {
      const m = list.find((x) => x.id === c.marketplaceId)!;
      const structured = await orchestratedExtract(c.url, {
        proxy: m.antiBotStealth ? "enhanced" : undefined,
        location:
          m.locationAware && (location || pincode)
            ? { country: country === "US" ? "US" : "IN", languages: ["en"] }
            : undefined,
        actions: pincode ? m.pincodeActions?.(pincode) : undefined,
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

      const fromStructured = coerceStructuredPrice(
        structured?.price ?? null,
        structured?.currency ?? null,
        defaultCurrency
      );
      const snippetHit = c.snippet.match(priceRe)?.[0] ?? null;
      const fromSnippet = snippetHit
        ? parsePrice(snippetHit, defaultCurrency)
        : { amount: null as number | null, currency: defaultCurrency as "INR" | "USD" };

      const priceRaw =
        fromStructured.amount != null
          ? structured?.price != null
            ? String(structured.price)
            : null
          : fromSnippet.amount != null
            ? snippetHit
            : null;

      const offer = normalizeOffer({
        retailer: m.name,
        retailerId: m.id,
        url: c.url,
        title,
        priceRaw,
        currency:
          fromStructured.amount != null
            ? fromStructured.currency
            : fromSnippet.amount != null
              ? fromSnippet.currency
              : structured?.currency ?? null,
        defaultCurrency,
        seller: structured?.seller ?? null,
        inStock: structured?.inStock ?? null,
        matchScore: match.score,
        matchReason: match.reason,
        priceConfidence:
          m.locationAware && location && !pincode ? 0.7 : m.pincodeActions && pincode ? 0.95 : 0.85,
      });

      if (filterOffersByCurrency([offer], defaultCurrency).length > 0) onOffer?.(offer);
      return offer;
    })
  );

  const liveOffers = filterOffersByCurrency(
    enriched.filter((o): o is MarketplaceOffer => o !== null),
    defaultCurrency
  ).sort((a, b) => {
    if (a.price != null && b.price != null) return a.price - b.price;
    if (a.price != null) return -1;
    if (b.price != null) return 1;
    return b.matchScore - a.matchScore;
  });

  return [...liveOffers, ...manualCheckOffers(product, country, defaultCurrency)];
}

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
