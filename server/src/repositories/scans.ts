import { desc, eq, sql } from "drizzle-orm";
import { getDb, withDbRetry } from "../db/client.js";
import { products, scans } from "../db/schema.js";

export async function recordScan(userId: string, productId: string) {
  const db = getDb();
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
