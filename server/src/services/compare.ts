import type { ProductIdentity } from "../schema.js";
import {
  currencyFor,
  findMarketplace,
  marketplacesFor,
  normalizeCountry,
  priceRegexFor,
  type Country,
} from "../marketplaces/registry.js";
import { matchScore, normalizeOffer, type MarketplaceOffer } from "../marketplaces/normalize.js";
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

export async function compareProduct(
  product: ProductIdentity,
  opts: { gtin?: string | null; country?: Country | string | null } = {}
): Promise<CompareResult> {
  const country = normalizeCountry(opts.country);
  const fp = `${productFingerprint(product)}:${country}`;
  const existing = inflight.get(fp);
  if (existing) {
    const offers = await existing;
    return { offers, productId: null, cached: true };
  }

  const promise = executeCompare(product, opts.gtin ?? null, country);
  inflight.set(fp, promise.then((r) => r.offers));
  try {
    return await promise;
  } finally {
    inflight.delete(fp);
  }
}

async function executeCompare(
  product: ProductIdentity,
  gtin: string | null,
  country: Country
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

  const offers = await liveCompare(product, gtin, country);

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
  country: Country
): Promise<MarketplaceOffer[]> {
  const tracker = new CreditTracker();
  const term = product.searchTerm || product.name;
  const brand = product.brand ? ` ${product.brand}` : "";
  const list = marketplacesFor(country);
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
      if (!m) continue;
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
      const structured = await orchestratedExtract(c.url).catch(() => null);
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

  return enriched
    .filter((o): o is MarketplaceOffer => o !== null)
    .sort((a, b) => {
      if (a.price != null && b.price != null) return a.price - b.price;
      if (a.price != null) return -1;
      if (b.price != null) return 1;
      return b.matchScore - a.matchScore;
    });
}
