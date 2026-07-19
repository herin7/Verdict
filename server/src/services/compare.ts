import type { ProductIdentity } from "../schema.js";
import {
  currencyFor,
  findMarketplace,
  manualUrlFor,
  marketplacesFor,
  normalizeCountry,
  scrapeMarketplacesForCategory,
  type Country,
} from "../marketplaces/registry.js";
import {
  buildPriceCandidate,
  coerceStructuredPrice,
  filterOffersByCurrency,
  filterPricedOffers,
  inferStockStatus,
  matchScore,
  normalizeOffer,
  payableFromEvidence,
  pickBestPayableFromText,
  sortOffersForDeals,
  type MarketplaceOffer,
  type PriceSource,
  type ReferencePrice,
} from "../marketplaces/normalize.js";
import {
  fetchDirectOfferFromUrl,
  fetchDirectOffers,
  isDirectCapableUrl,
  type DirectOffer,
} from "../marketplaces/direct/index.js";
import { extractPack, packMatch } from "../marketplaces/pack.js";
import { orchestratedExtract, orchestratedSearchMany } from "../providers/orchestrator.js";
import { findOrCreateProduct } from "./../repositories/products.js";
import { getFreshOffers, upsertOffers } from "../repositories/offers.js";
import { dbAvailable } from "../db/client.js";
import { productFingerprint } from "../db/fingerprint.js";
import { backfillProductImageIfMissing } from "../productImage.js";

const MIN_MATCH = 0.35;
/** Extract only as enrichment for a few URLs — snippets carry the first prices. */
const MAX_EXTRACT = 5;
/** Cap direct HTML fetches from search hits (Amazon/Flipkart). */
const MAX_DIRECT_FROM_SEARCH = 4;
const DIRECT_TIMEOUT_MS = 5_000;
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
    asin?: string | null;
    fsn?: string | null;
    flipkartItemId?: string | null;
    productUrl?: string | null;
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
    {
      gtin: opts.gtin ?? null,
      asin: opts.asin ?? null,
      fsn: opts.fsn ?? null,
      flipkartItemId: opts.flipkartItemId ?? null,
      productUrl: opts.productUrl ?? null,
    },
    country,
    location,
    pincode,
    locationScoped,
    opts.reference ?? null,
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
  ids: {
    gtin: string | null;
    asin: string | null;
    fsn: string | null;
    flipkartItemId: string | null;
    productUrl: string | null;
  },
  country: Country,
  location: UserLocation | null,
  pincode: string | null,
  locationScoped: boolean,
  reference: ReferencePrice | null,
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
        const filtered = sortOffersForDeals(
          filterPricedOffers(filterOffersByCurrency(cached, currencyFor(country)))
        );
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

  const offers = await liveCompare(product, ids, country, location, pincode, reference, onOffer);

  if (productId && offers.length > 0 && !locationScoped) {
    await upsertOffers(productId, offers).catch((err) =>
      console.warn("[compare] cache write failed:", (err as Error).message)
    );
  }

  return { offers, productId, cached: false };
}

type SearchCandidate = { url: string; title: string; snippet: string; marketplaceId: string };

function snippetPriceRaw(
  title: string,
  snippet: string,
  defaultCurrency: string
): string | null {
  const blob = `${title} ${snippet}`;
  const best = pickBestPayableFromText(blob, {
    source: "search_snippet",
    defaultCurrency,
    declaredCurrency: defaultCurrency,
  });
  return best?.raw ?? null;
}

function buildOfferFromSources(opts: {
  marketplaceName: string;
  marketplaceId: string;
  url: string;
  title: string;
  priceRaw: string | null;
  priceContext: string;
  priceSource: PriceSource;
  fieldPath?: string | null;
  currency: string | null;
  defaultCurrency: string;
  seller: string | null;
  inStock: boolean | null;
  matchScore: number;
  matchReason: string;
  priceConfidence: number;
  locationScope?: string | null;
}): MarketplaceOffer {
  return normalizeOffer({
    retailer: opts.marketplaceName,
    retailerId: opts.marketplaceId,
    url: opts.url,
    title: opts.title,
    priceRaw: opts.priceRaw,
    priceContext: opts.priceContext,
    priceSource: opts.priceSource,
    fieldPath: opts.fieldPath ?? null,
    currency: opts.currency,
    defaultCurrency: opts.defaultCurrency,
    seller: opts.seller,
    inStock: opts.inStock,
    matchScore: opts.matchScore,
    matchReason: opts.matchReason,
    priceConfidence: opts.priceConfidence,
    locationScope: opts.locationScope ?? null,
  });
}

function offerFromDirect(
  d: DirectOffer,
  product: ProductIdentity,
  gtin: string | null,
  defaultCurrency: string,
  trustedId: boolean
): MarketplaceOffer | null {
  if (!passesPackGate(product, d.title, trustedId)) return null;
  const match = matchScore({
    productName: product.name,
    productBrand: product.brand,
    productModel: product.model,
    productGtin: gtin,
    candidateTitle: d.title,
    candidateGtin: null,
  });
  // Only caller-supplied ASIN/FSN/product URL is an identity match. An ID merely
  // discovered on a search hit identifies that candidate, not the requested product.
  const score = Math.max(match.score, trustedId && d.productId ? 0.85 : 0);
  if (score < MIN_MATCH) return null;
  return buildOfferFromSources({
    marketplaceName: d.retailer,
    marketplaceId: d.retailerId,
    url: d.url,
    title: d.title,
    priceRaw: d.priceRaw,
    priceContext: d.priceContext,
    priceSource: d.priceSource,
    fieldPath: d.fieldPath,
    currency: d.currency,
    defaultCurrency,
    seller: d.seller,
    inStock: d.inStock,
    matchScore: score,
    matchReason: trustedId && d.productId ? `${match.reason}+id` : match.reason,
    priceConfidence: 0.92,
  });
}

function passesPackGate(
  product: ProductIdentity,
  candidateText: string,
  trustedIdentity = false
): boolean {
  const expected = `${product.name} ${product.searchTerm}`;
  const match = packMatch(expected, candidateText);
  if (match === "mismatch") return false;
  return (
    trustedIdentity ||
    product.category.toLowerCase() !== "grocery" ||
    !extractPack(expected) ||
    match === "exact"
  );
}

export function currentQuickCommerceOffer(
  product: ProductIdentity,
  country: Country,
  reference: ReferencePrice | null
): MarketplaceOffer | null {
  const defaultCurrency = currencyFor(country);
  if (!reference?.amount || reference.currency !== defaultCurrency) return null;
  const marketplace = marketplacesFor(country).find((item) => item.id === reference.retailerId);
  if (marketplace?.kind !== "quick_commerce") return null;
  return buildOfferFromSources({
    marketplaceName: marketplace.name,
    marketplaceId: marketplace.id,
    url: manualUrlFor(marketplace, product.searchTerm || product.name),
    title: product.name,
    priceRaw: String(reference.amount),
    priceContext: String(reference.amount),
    priceSource: "screen_text",
    fieldPath: "current_listing.reference",
    currency: reference.currency,
    defaultCurrency,
    seller: null,
    inStock: null,
    matchScore: 1,
    matchReason: "current_listing",
    priceConfidence: 1,
    locationScope: "device_current",
  });
}

async function liveCompare(
  product: ProductIdentity,
  ids: {
    gtin: string | null;
    asin: string | null;
    fsn: string | null;
    flipkartItemId: string | null;
    productUrl: string | null;
  },
  country: Country,
  location: UserLocation | null,
  pincode: string | null,
  reference: ReferencePrice | null,
  onOffer?: (offer: MarketplaceOffer) => void
): Promise<MarketplaceOffer[]> {
  const term = product.searchTerm || product.name;
  const brand = product.brand ? ` ${product.brand}` : "";
  const list = scrapeMarketplacesForCategory(country, product.category).filter(
    (m) =>
      m.kind !== "quick_commerce" ||
      // Location-sensitive prices are not current unless this request can set
      // and verify the marketplace's delivery area. None passed live anonymous
      // testing yet, so existing Firecrawl remains dormant instead of lying.
      Boolean(pincode && m.pincodeActions)
  );
  const defaultCurrency = currencyFor(country);

  /** Best priced offer per URL key; extract may upgrade. */
  const byUrl = new Map<string, MarketplaceOffer>();
  const emitted = new Set<string>();
  /** URLs already priced via direct HTML — skip Firecrawl extract. */
  const directResolved = new Set<string>();

  const publish = (offer: MarketplaceOffer) => {
    const [guarded] = applyReferenceGuard([offer], reference);
    const priced = filterPricedOffers(filterOffersByCurrency([guarded], defaultCurrency));
    if (!priced.length) return;
    const next = priced[0]!;
    const prev = byUrl.get(next.url);
    const better =
      !prev ||
      (next.price != null &&
        (prev.price == null ||
          (next.priceConfidence ?? 0) > (prev.priceConfidence ?? 0) + 0.05 ||
          next.price < prev.price ||
          (next.price === prev.price && next.inStock === true && prev.inStock !== true)));
    if (!better) return;
    byUrl.set(next.url, next);
    if (!emitted.has(next.url)) {
      emitted.add(next.url);
      onOffer?.(next);
    } else {
      onOffer?.(next);
    }
  };

  // The listing currently visible on the user's device is location-correct and
  // stronger evidence than an anonymous quick-commerce web page.
  const currentOffer = currentQuickCommerceOffer(product, country, reference);
  if (currentOffer) publish(currentOffer);

  // Phase 0: direct Amazon.in / Flipkart by ASIN/FSN/URL (parallel, ~5s).
  // Firecrawl search/extract still runs for discovery + other retailers.
  if (country === "IN") {
    const direct = await fetchDirectOffers(product, {
      asin: ids.asin,
      fsn: ids.fsn,
      flipkartItemId: ids.flipkartItemId,
      productUrl: ids.productUrl,
      timeoutMs: DIRECT_TIMEOUT_MS,
    });
    for (const d of direct) {
      const offer = offerFromDirect(d, product, ids.gtin, defaultCurrency, true);
      if (!offer) continue;
      directResolved.add(d.url);
      publish(offer);
    }
  }

  const tasks = list
    .filter((m) => m.domains[0])
    .map((m) => ({
      type: m.id,
      prompt: `site:${m.domains[0]} ${term}${brand}${product.model ? ` ${product.model}` : ""} buy price`,
      minResults: 1,
    }));

  const grouped = await orchestratedSearchMany(tasks, { limit: 4, timeoutMs: 10000 });
  const candidates: SearchCandidate[] = [];

  for (const g of grouped) {
    for (const r of g.results.slice(0, 2)) {
      const m = findMarketplace(r.url, country);
      if (!m || !list.some((x) => x.id === m.id)) continue;
      if (!passesPackGate(product, `${r.title ?? ""} ${r.snippet ?? ""}`)) continue;
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

  // Phase 1: search-snippet prices with evidence validation (no extract wait).
  for (const c of unique) {
    const m = list.find((x) => x.id === c.marketplaceId);
    if (!m) continue;
    const match = matchScore({
      productName: product.name,
      productBrand: product.brand,
      productModel: product.model,
      productGtin: ids.gtin,
      candidateTitle: c.title,
      candidateGtin: null,
    });
    if (match.score < MIN_MATCH) continue;

    const raw = snippetPriceRaw(c.title, c.snippet, defaultCurrency);
    if (!raw) continue;
    const snippetCand = buildPriceCandidate({
      raw,
      context: `${c.title} ${c.snippet}`,
      source: "search_snippet",
      declaredCurrency: defaultCurrency,
      defaultCurrency,
      allowBareNumeric: false,
    });
    if (!payableFromEvidence(snippetCand)) continue;

    publish(
      buildOfferFromSources({
        marketplaceName: m.name,
        marketplaceId: m.id,
        url: c.url,
        title: c.title,
        priceRaw: snippetCand.raw,
        priceContext: `${c.title} ${c.snippet}`,
        priceSource: "search_snippet",
        currency: defaultCurrency,
        defaultCurrency,
        seller: null,
        inStock: inferStockStatus(`${c.title} ${c.snippet}`, null),
        matchScore: match.score,
        matchReason: match.reason,
        priceConfidence: 0.75,
      })
    );
  }

  // Phase 1.5: direct HTML parse for Amazon/Flipkart search hits (not Firecrawl extract).
  const directTargets = allocateCandidatesRoundRobin(
    unique.filter((c) => isDirectCapableUrl(c.url) && !directResolved.has(c.url)),
    MAX_DIRECT_FROM_SEARCH
  );
  await Promise.all(
    directTargets.map(async (c) => {
      const d = await fetchDirectOfferFromUrl(c.url, { timeoutMs: DIRECT_TIMEOUT_MS }).catch(() => null);
      if (!d) return;
      const offer = offerFromDirect(
        { ...d, title: d.title || c.title },
        product,
        ids.gtin,
        defaultCurrency,
        false
      );
      if (!offer) return;
      directResolved.add(c.url);
      directResolved.add(d.url);
      publish(offer);
    })
  );

  // Phase 2: Firecrawl extract enrichment for remaining URLs / other retailers.
  // Timeouts/403s must not wipe snippet/direct offers already published.
  const enrichTargets = allocateCandidatesRoundRobin(
    unique.filter((c) => {
      if (directResolved.has(c.url)) return false;
      // Skip Amazon/Flipkart when direct already covered that marketplace with a price.
      if (
        (c.marketplaceId === "amazon_in" || c.marketplaceId === "flipkart") &&
        [...byUrl.values()].some((o) => o.retailerId === c.marketplaceId && o.price != null)
      ) {
        return false;
      }
      const match = matchScore({
        productName: product.name,
        productBrand: product.brand,
        productModel: product.model,
        productGtin: ids.gtin,
        candidateTitle: c.title,
        candidateGtin: null,
      });
      return match.score >= MIN_MATCH;
    }),
    MAX_EXTRACT
  );

  await Promise.all(
    enrichTargets.map(async (c) => {
      const m = list.find((x) => x.id === c.marketplaceId);
      if (!m) return;
      const structured = await orchestratedExtract(c.url, {
        proxy: m.antiBotStealth ? "enhanced" : undefined,
        location:
          m.locationAware && (location || pincode)
            ? { country: country === "US" ? "US" : "IN", languages: ["en"] }
            : undefined,
        actions: pincode ? m.pincodeActions?.(pincode) : undefined,
      }).catch(() => null);

      const title = structured?.title || c.title;
      if (!passesPackGate(product, `${title} ${c.snippet}`)) return;
      const match = matchScore({
        productName: product.name,
        productBrand: product.brand,
        productModel: product.model,
        productGtin: ids.gtin,
        candidateTitle: title,
        candidateGtin: structured?.gtin || structured?.ean || structured?.upc || null,
      });
      if (match.score < MIN_MATCH) return;

      const fromStructured = coerceStructuredPrice(
        structured?.price ?? null,
        structured?.currency ?? null,
        defaultCurrency,
        { fieldPath: "price", context: structured?.price != null ? String(structured.price) : null }
      );
      const snippetRaw = snippetPriceRaw(c.title, c.snippet, defaultCurrency);
      const snippetCand = buildPriceCandidate({
        raw: snippetRaw,
        context: `${c.title} ${c.snippet}`,
        source: "search_snippet",
        declaredCurrency: defaultCurrency,
        defaultCurrency,
        allowBareNumeric: false,
      });
      const fromSnippet = payableFromEvidence(snippetCand);

      const priceRaw =
        fromStructured.amount != null
          ? structured?.price != null
            ? String(structured.price)
            : null
          : fromSnippet
            ? snippetCand.raw
            : null;
      if (!priceRaw) return;

      publish(
        buildOfferFromSources({
          marketplaceName: m.name,
          marketplaceId: m.id,
          url: c.url,
          title,
          priceRaw,
          priceContext:
            fromStructured.amount != null ? String(structured?.price ?? "") : `${c.title} ${c.snippet}`,
          priceSource: fromStructured.amount != null ? "product_format" : "search_snippet",
          fieldPath: fromStructured.amount != null ? "price" : null,
          currency:
            fromStructured.amount != null
              ? fromStructured.currency
              : fromSnippet
                ? fromSnippet.currency
                : structured?.currency ?? null,
          defaultCurrency,
          seller: structured?.seller ?? null,
          inStock: inferStockStatus(
            `${title} ${c.snippet}`,
            structured?.inStock ?? null
          ),
          matchScore: match.score,
          matchReason: match.reason,
          priceConfidence:
            m.locationAware && location && !pincode ? 0.7 : m.pincodeActions && pincode ? 0.95 : 0.85,
          locationScope: pincode && m.pincodeActions ? `pin:${pincode}` : null,
        })
      );
    })
  );

  // No check-manually shells for missing platforms — omit entirely.
  return sortOffersForDeals(filterPricedOffers([...byUrl.values()]));
}
