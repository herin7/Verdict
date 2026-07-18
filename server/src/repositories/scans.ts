import { and, desc, eq, gt, sql } from "drizzle-orm";
import { getDb, withDbRetry } from "../db/client.js";
import { products, scans } from "../db/schema.js";

const DUPLICATE_WINDOW_MS = 60_000;

/**
 * Records a scan, but skips inserting a duplicate row if the same user
 * already scanned this exact product within the last minute - a safeguard
 * against double-counting from retried/duplicate requests (e.g. a client
 * retry, or two effects firing for the same view), not a general "only log
 * once per session" throttle. Genuinely separate views/re-scans still each
 * get their own row.
 */
export async function recordScan(userId: string, productId: string) {
  const db = getDb();
  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  const recent = await withDbRetry(() =>
    db
      .select({ id: scans.id })
      .from(scans)
      .where(and(eq(scans.userId, userId), eq(scans.productId, productId), gt(scans.createdAt, cutoff)))
      .limit(1)
  );
  if (recent[0]) return;
  await withDbRetry(() => db.insert(scans).values({ userId, productId }));
}

export async function listScans(userId: string, limit = 50) {
  const db = getDb();
  return withDbRetry(() =>
    db
      .select({
        id: scans.id,
        createdAt: scans.createdAt,
        productId: products.id,
        name: products.name,
        brand: products.brand,
        category: products.category,
        model: products.model,
        searchTerm: products.searchTerm,
        imageUrl: products.imageUrl,
      })
      .from(scans)
      .innerJoin(products, eq(scans.productId, products.id))
      .where(eq(scans.userId, userId))
      .orderBy(desc(scans.createdAt))
      .limit(limit)
  );
}

export async function countScans(userId: string) {
  const db = getDb();
  const rows = await withDbRetry(() =>
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(scans)
      .where(eq(scans.userId, userId))
  );
  return rows[0]?.count ?? 0;
}
