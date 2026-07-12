import { and, eq, gt } from "drizzle-orm";
import { getDb, withDbRetry } from "../db/client.js";
import { buyLinks } from "../db/schema.js";
import { config } from "../config.js";
import type { BuyLink } from "../buylinks.js";

export async function getFreshBuyLinks(productId: string): Promise<BuyLink[] | null> {
  const db = getDb();
  const rows = await withDbRetry(() =>
    db
      .select()
      .from(buyLinks)
      .where(and(eq(buyLinks.productId, productId), gt(buyLinks.expiresAt, new Date())))
      .limit(1)
  );
  if (!rows[0]) return null;
  return rows[0].links as BuyLink[];
}

export async function upsertBuyLinks(productId: string, links: BuyLink[]) {
  const db = getDb();
  const expiresAt = new Date(Date.now() + config.buyLinkTtlHours * 60 * 60 * 1000);
  const values = {
    productId,
    links,
    expiresAt,
    createdAt: new Date(),
  };

  await withDbRetry(() =>
    db
      .insert(buyLinks)
      .values(values)
      .onConflictDoUpdate({
        target: buyLinks.productId,
        set: {
          links: values.links,
          expiresAt: values.expiresAt,
          createdAt: values.createdAt,
        },
      })
  );
}
