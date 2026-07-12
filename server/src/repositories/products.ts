import { eq } from "drizzle-orm";
import { getDb, withDbRetry } from "../db/client.js";
import { productFingerprint } from "../db/fingerprint.js";
import { products } from "../db/schema.js";
import type { ProductIdentity } from "../schema.js";

export async function findOrCreateProduct(identity: ProductIdentity) {
  const db = getDb();
  const fingerprint = productFingerprint(identity);

  const existing = await withDbRetry(() =>
    db.select().from(products).where(eq(products.fingerprint, fingerprint)).limit(1)
  );
  if (existing[0]) return existing[0];

  const inserted = await withDbRetry(() =>
    db
      .insert(products)
      .values({
        fingerprint,
        name: identity.name,
        brand: identity.brand,
        category: identity.category,
        model: identity.model,
        searchTerm: identity.searchTerm || identity.name,
      })
      .onConflictDoNothing({ target: products.fingerprint })
      .returning()
  );

  if (inserted[0]) return inserted[0];

  const again = await withDbRetry(() =>
    db.select().from(products).where(eq(products.fingerprint, fingerprint)).limit(1)
  );
  if (!again[0]) throw new Error("Failed to create product");
  return again[0];
}

export async function updateProductImage(productId: string, imageUrl: string) {
  const db = getDb();
  await withDbRetry(() => db.update(products).set({ imageUrl }).where(eq(products.id, productId)));
}

export async function getProductById(id: string) {
  const db = getDb();
  const rows = await withDbRetry(() => db.select().from(products).where(eq(products.id, id)).limit(1));
  return rows[0] ?? null;
}
