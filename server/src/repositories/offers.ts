import { and, eq, gt } from "drizzle-orm";
import { dbAvailable, getDb, withDbRetry } from "../db/client.js";
import { marketplaceOffers } from "../db/schema.js";
import { sanitizeCachedOffers, type MarketplaceOffer } from "../marketplaces/normalize.js";
import { config } from "../config.js";

export async function getFreshOffers(productId: string): Promise<MarketplaceOffer[] | null> {
  if (!dbAvailable()) return null;
  const db = getDb();
  const rows = await withDbRetry(() =>
    db
      .select()
      .from(marketplaceOffers)
      .where(and(eq(marketplaceOffers.productId, productId), gt(marketplaceOffers.expiresAt, new Date())))
      .limit(1)
  );
  if (!rows[0]) return null;
  const cleaned = sanitizeCachedOffers(rows[0].offers);
  return cleaned.length > 0 ? cleaned : null;
}

export async function upsertOffers(productId: string, offers: MarketplaceOffer[]): Promise<void> {
  if (!dbAvailable()) return;
  const db = getDb();
  const expiresAt = new Date(Date.now() + config.offerTtlHours * 60 * 60 * 1000);
  await withDbRetry(() =>
    db
      .insert(marketplaceOffers)
      .values({ productId, offers, expiresAt })
      .onConflictDoUpdate({
        target: marketplaceOffers.productId,
        set: { offers, expiresAt, createdAt: new Date() },
      })
  );
}
