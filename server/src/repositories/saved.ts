import { and, desc, eq } from "drizzle-orm";
import { getDb, withDbRetry } from "../db/client.js";
import { buyLinks, products, reports, savedReports } from "../db/schema.js";

export async function listSaved(userId: string) {
  const db = getDb();
  return withDbRetry(() =>
    db
      .select({
        id: savedReports.id,
        savedAt: savedReports.savedAt,
        productId: products.id,
        name: products.name,
        brand: products.brand,
        category: products.category,
        model: products.model,
        searchTerm: products.searchTerm,
        imageUrl: products.imageUrl,
        report: reports.report,
        links: buyLinks.links,
      })
      .from(savedReports)
      .innerJoin(products, eq(savedReports.productId, products.id))
      .leftJoin(reports, eq(reports.productId, products.id))
      .leftJoin(buyLinks, eq(buyLinks.productId, products.id))
      .where(eq(savedReports.userId, userId))
      .orderBy(desc(savedReports.savedAt))
  );
}

export async function saveReport(userId: string, productId: string) {
  const db = getDb();
  await withDbRetry(() =>
    db
      .insert(savedReports)
      .values({ userId, productId })
      .onConflictDoNothing({ target: [savedReports.userId, savedReports.productId] })
  );
}

export async function unsaveReport(userId: string, productId: string) {
  const db = getDb();
  await withDbRetry(() =>
    db
      .delete(savedReports)
      .where(and(eq(savedReports.userId, userId), eq(savedReports.productId, productId)))
  );
}

export async function isSaved(userId: string, productId: string) {
  const db = getDb();
  const rows = await withDbRetry(() =>
    db
      .select({ id: savedReports.id })
      .from(savedReports)
      .where(and(eq(savedReports.userId, userId), eq(savedReports.productId, productId)))
      .limit(1)
  );
  return Boolean(rows[0]);
}
