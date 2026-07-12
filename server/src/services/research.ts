import type { BuyLink } from "../buylinks.js";
import { productFingerprint } from "../db/fingerprint.js";
import { dbAvailable } from "../db/client.js";
import { runResearch, type ResearchResult } from "../pipeline.js";
import { findOrCreateProduct } from "../repositories/products.js";
import { getFreshReport, upsertReport } from "../repositories/reports.js";
import { getFreshBuyLinks, upsertBuyLinks } from "../repositories/buyLinks.js";
import { recordScan } from "../repositories/scans.js";
import type { ConsensusReport, ProductIdentity } from "../schema.js";
import { config } from "../config.js";

const inflight = new Map<string, Promise<ResearchResult & { productId?: string; cached?: boolean }>>();

export type CachedResearchResult = ResearchResult & {
  productId?: string;
  cached: boolean;
};

/**
 * Cache-aside research with request coalescing.
 * Same fingerprint mid-flight shares one Anakin+Claude run.
 */
export async function researchProduct(
  product: ProductIdentity,
  opts: { userId?: string } = {}
): Promise<CachedResearchResult> {
  const fp = productFingerprint(product);

  const existing = inflight.get(fp);
  if (existing) {
    const shared = await existing;
    if (opts.userId && dbAvailable() && shared.productId) {
      await recordScan(opts.userId, shared.productId).catch(() => {});
    }
    return { ...shared, cached: true };
  }

  const promise = executeResearch(product, opts.userId);
  inflight.set(fp, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(fp);
  }
}

async function executeResearch(
  product: ProductIdentity,
  userId?: string
): Promise<CachedResearchResult> {
  if (dbAvailable()) {
    try {
      const row = await findOrCreateProduct(product);
      const cachedReport = await getFreshReport(row.id);
      if (cachedReport) {
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
      const fresh = await runResearch(product);
      await upsertReport(row.id, fresh.report, config.anthropicModel);
      await upsertBuyLinks(row.id, fresh.buyLinks);
      if (userId) await recordScan(userId, row.id).catch(() => {});
      return { ...fresh, productId: row.id, cached: false };
    } catch (err) {
      console.warn("[cache] db path failed, falling through to live pipeline:", (err as Error).message);
    }
  }

  const fresh = await runResearch(product);
  return { ...fresh, cached: false };
}

export async function cacheBuyLinksOnly(product: ProductIdentity, links: BuyLink[]) {
  if (!dbAvailable()) return;
  const row = await findOrCreateProduct(product);
  await upsertBuyLinks(row.id, links);
}
