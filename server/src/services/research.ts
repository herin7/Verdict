import { eq, lt, or, sql } from "drizzle-orm";
import { getDb, withDbRetry } from "../db/client.js";
import { researchRuns } from "../db/schema.js";
import { runResearch, type ResearchStep } from "../pipeline.js";
import { findOrCreateProduct } from "../repositories/products.js";
import { getFreshReport, upsertReport } from "../repositories/reports.js";
import { backfillProductImageIfMissing } from "../productImage.js";
import { currencyFor, type Country } from "../marketplaces/registry.js";
import { ConsensusReportSchema, REPORT_SCHEMA_VERSION, type ConsensusReport, type ProductIdentity } from "../schema.js";
import { config } from "../config.js";

/** A run older than this is assumed dead (its Lambda crashed) and can be taken over. */
const STALE_RUN_MS = 5 * 60 * 1000;
const WAIT_POLL_MS = 3000;

export type ResearchOutcome = { report: ConsensusReport; productId: string; cached: boolean };

/**
 * Product → verdict, reusing work wherever possible:
 *   1. a fresh cached report for this product → returned immediately
 *   2. someone else is already researching it → wait for their result
 *   3. otherwise claim the product, research it, cache the report
 */
export async function researchProduct(
  product: ProductIdentity,
  opts: { country: Country; onStep?: (step: ResearchStep) => void | Promise<void> }
): Promise<ResearchOutcome> {
  const row = await findOrCreateProduct(product);
  backfillProductImageIfMissing(row.id, row.imageUrl, product);

  const deadline = Date.now() + STALE_RUN_MS;
  while (true) {
    const cached = await cachedReport(row.id);
    if (cached) return { report: cached, productId: row.id, cached: true };

    if (await claimResearch(row.id)) break;
    if (Date.now() > deadline) throw new Error("Timed out waiting for another research run");
    await new Promise((r) => setTimeout(r, WAIT_POLL_MS)); // another worker has it - wait for its report
  }

  try {
    const { report } = await runResearch(product, opts.country, opts.onStep);
    await upsertReport(row.id, report, config.anthropicModel, currencyFor(opts.country), opts.country);
    return { report, productId: row.id, cached: false };
  } finally {
    await withDbRetry(() => getDb().delete(researchRuns).where(eq(researchRuns.productId, row.id))).catch(() => {});
  }
}

/** Fresh report in the current format, or null. Older formats count as a miss. */
async function cachedReport(productId: string): Promise<ConsensusReport | null> {
  const row = await getFreshReport(productId);
  if ((row?.report as { schemaVersion?: number } | undefined)?.schemaVersion !== REPORT_SCHEMA_VERSION) return null;
  const parsed = ConsensusReportSchema.safeParse(row!.report);
  return parsed.success ? parsed.data : null;
}

/**
 * Atomically becomes "the" researcher for a product. Inserts the run row, or
 * takes over a run that has been silent too long. Returns false if someone
 * else is actively researching it.
 */
async function claimResearch(productId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_RUN_MS);
  const rows = await withDbRetry(() =>
    getDb()
      .insert(researchRuns)
      .values({ productId })
      .onConflictDoUpdate({
        target: researchRuns.productId,
        set: { startedAt: sql`now()` },
        setWhere: or(lt(researchRuns.startedAt, staleBefore)),
      })
      .returning({ productId: researchRuns.productId })
  );
  return rows.length > 0;
}
