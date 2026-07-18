import { randomUUID } from "node:crypto";
import type { MarketplaceOffer } from "../marketplaces/normalize.js";

/**
 * In-memory progressive-results store for /compare/start + /compare/poll.
 * Deliberately not persisted (Postgres or otherwise) - a compare job is a
 * few-second scratch buffer for one client's own poll loop, never queried by
 * anything else, and gone the moment it's stale. A DB table (with its own
 * migration, cleanup job, and cross-instance-consistency question on a
 * multi-instance deployment) would be real infra for something this
 * short-lived and single-consumer.
 */
interface CompareJob {
  offers: MarketplaceOffer[];
  productId: string | null;
  cached: boolean;
  done: boolean;
  error: string | null;
  createdAt: number;
}

const JOB_TTL_MS = 3 * 60_000;
const jobs = new Map<string, CompareJob>();

function sweepExpired() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

export function createCompareJob(): string {
  sweepExpired();
  const id = randomUUID();
  jobs.set(id, { offers: [], productId: null, cached: false, done: false, error: null, createdAt: Date.now() });
  return id;
}

/** Called once per offer as extraction resolves - see compare.ts's onOffer callback. */
export function appendCompareOffer(jobId: string, offer: MarketplaceOffer): void {
  jobs.get(jobId)?.offers.push(offer);
}

/**
 * Replaces the job's offers with the authoritative final list (reference-guard,
 * final currency filter, and sort already applied) - the incrementally
 * appended list is a progress preview, not the source of truth, and can
 * differ slightly (ordering, a reference-guard price override) from the
 * final result.
 */
export function completeCompareJob(
  jobId: string,
  result: { offers: MarketplaceOffer[]; productId: string | null; cached: boolean }
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.offers = result.offers;
  job.productId = result.productId;
  job.cached = result.cached;
  job.done = true;
}

export function failCompareJob(jobId: string, message: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.error = message;
  job.done = true;
}

export function getCompareJob(jobId: string): CompareJob | undefined {
  return jobs.get(jobId);
}
