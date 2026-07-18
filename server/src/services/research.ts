import type { BuyLink } from "../buylinks.js";
import { productFingerprint } from "../db/fingerprint.js";
import { dbAvailable } from "../db/client.js";
import { runResearch, type ResearchResult } from "../pipeline.js";
import { findOrCreateProduct } from "../repositories/products.js";
import { getFreshReport, upsertReport } from "../repositories/reports.js";
import { getFreshBuyLinks, upsertBuyLinks } from "../repositories/buyLinks.js";
import { recordScan } from "../repositories/scans.js";
import { backfillProductImageIfMissing } from "../productImage.js";
import { currencyFor, normalizeCountry, type Country } from "../marketplaces/registry.js";
import type { ConsensusReport, ProductIdentity } from "../schema.js";
import { config } from "../config.js";

const inflight = new Map<string, Promise<ResearchResult & { productId?: string; cached?: boolean }>>();

export type CachedResearchResult = ResearchResult & {
  productId?: string;
  cached: boolean;
};

/**
 * Cache-aside research with request coalescing.
 * Same fingerprint+country mid-flight shares one Firecrawl+Claude run - country
 * is part of the coalescing key because the report text itself is pinned to
 * a currency (see claude.ts), so an IN request must never share an in-flight
 * US run (or vice versa).
 */
export async function researchProduct(
  product: ProductIdentity,
  opts: { userId?: string; country?: Country | string | null } = {}
): Promise<CachedResearchResult> {
  const country = normalizeCountry(opts.country);
  const fp = `${productFingerprint(product)}:${country}`;

  const existing = inflight.get(fp);
  if (existing) {
    const shared = await existing;
    if (opts.userId && dbAvailable() && shared.productId) {
      await recordScan(opts.userId, shared.productId).catch(() => {});
    }
    return { ...shared, cached: true };
  }

  const promise = executeResearch(product, country, opts.userId);
  inflight.set(fp, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(fp);
  }
}

async function executeResearch(
  product: ProductIdentity,
  country: Country,
  userId?: string
): Promise<CachedResearchResult> {
  const currency = currencyFor(country);
  if (dbAvailable()) {
    try {
      const row = await findOrCreateProduct(product);
      backfillProductImageIfMissing(row.id, row.imageUrl, product);
      const cachedReport = await getFreshReport(row.id);
      // A cached report generated for the OTHER country's currency is never
      // reused - its verdictLine/priceAnalysis/buyingAdvice text is pinned to
      // that currency (see claude.ts), so serving it to this country would
      // reintroduce the exact wrong-currency bug this cache check exists to
      // prevent. Treated as a miss: falls through to a fresh, correctly-
      // pinned run below.
      if (cachedReport && (!cachedReport.currency || cachedReport.currency === currency)) {
        const links = (await getFreshBuyLinks(row.id)) ?? [];
        if (userId) await recordScan(userId, row.id).catch(() => {});
        console.log(`[cache] HIT report fingerprint product=${row.id}`);
        return {
          report: cachedReport.report as ConsensusReport,
          buyLinks: links,
          productId: row.id,
          cached: true,
        };
      }

      console.log(`[cache] MISS report product=${row.id} - running pipeline`);
      const fresh = await runResearch(product, country);
      await upsertReport(row.id, fresh.report, config.anthropicModel, currency, country);
      await upsertBuyLinks(row.id, fresh.buyLinks);
      if (userId) await recordScan(userId, row.id).catch(() => {});
      return { ...fresh, productId: row.id, cached: false };
    } catch (err) {
      console.warn("[cache] db path failed, falling through to live pipeline:", (err as Error).message);
    }
  }

  const fresh = await runResearch(product, country);
  return { ...fresh, cached: false };
}

export async function cacheBuyLinksOnly(product: ProductIdentity, links: BuyLink[]) {
  if (!dbAvailable()) return;
  const row = await findOrCreateProduct(product);
  await upsertBuyLinks(row.id, links);
}
