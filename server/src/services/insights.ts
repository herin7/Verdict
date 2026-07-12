import { dbAvailable } from "../db/client.js";
import { productFingerprint } from "../db/fingerprint.js";
import {
  getLongTermScore,
  getVersionHistory,
  getScamDetector,
  getBestInCategory,
  type InsightType,
} from "../insights.js";
import { findOrCreateProduct } from "../repositories/products.js";
import { getFreshInsight, upsertInsight } from "../repositories/insights.js";
import type { ProductIdentity } from "../schema.js";

const HANDLERS = {
  "long-term": getLongTermScore,
  "version-history": getVersionHistory,
  "scam-detector": getScamDetector,
  "best-in-category": getBestInCategory,
} as const;

const inflight = new Map<string, Promise<unknown>>();

export async function fetchInsight(type: InsightType, product: ProductIdentity) {
  const key = `${productFingerprint(product)}:${type}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = executeInsight(type, product);
  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

async function executeInsight(type: InsightType, product: ProductIdentity) {
  if (dbAvailable()) {
    try {
      const row = await findOrCreateProduct(product);
      const cached = await getFreshInsight(row.id, type);
      if (cached) {
        console.log(`[cache] HIT insight type=${type} product=${row.id}`);
        return cached.insight;
      }
      console.log(`[cache] MISS insight type=${type} product=${row.id}`);
      const fresh = await HANDLERS[type](product);
      await upsertInsight(row.id, type, fresh);
      return fresh;
    } catch (err) {
      console.warn("[cache] insight db path failed:", (err as Error).message);
    }
  }
  return HANDLERS[type](product);
}
