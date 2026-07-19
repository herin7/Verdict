import { and, eq, gt } from "drizzle-orm";
import { getDb, withDbRetry } from "../db/client.js";
import { buyLinks } from "../db/schema.js";
import { config } from "../config.js";
import { sanitizeBuyLinks, type BuyLink } from "../buylinks.js";
import { normalizeCountry } from "../marketplaces/registry.js";

export async function getFreshBuyLinks(productId: string, country: string = "IN"): Promise<BuyLink[] | null> {
  const db = getDb();
  const rows = await withDbRetry(() =>
    db
      .select()
      .from(buyLinks)
      .where(and(eq(buyLinks.productId, productId), gt(buyLinks.expiresAt, new Date())))
      .limit(1)
  );
  if (!rows[0]) return null;
  return sanitizeBuyLinks(rows[0].links, normalizeCountry(country));
}

export async function upsertBuyLinks(productId: string, links: BuyLink[]) {
  const db = getDb();
  const expiresAt = new Date(Date.now() + config.buyLinkTtlHours * 60 * 60 * 1000);
  const sanitized = sanitizeBuyLinks(links);
  const values = {
    productId,
    links: sanitized,
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
