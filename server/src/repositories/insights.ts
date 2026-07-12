import { and, eq, gt } from "drizzle-orm";
import { getDb, withDbRetry } from "../db/client.js";
import { insights } from "../db/schema.js";
import { config } from "../config.js";

export async function getFreshInsight(productId: string, type: string) {
  const db = getDb();
  const rows = await withDbRetry(() =>
    db
      .select()
      .from(insights)
      .where(and(eq(insights.productId, productId), eq(insights.type, type), gt(insights.expiresAt, new Date())))
      .limit(1)
  );
  return rows[0] ?? null;
}

export async function upsertInsight(productId: string, type: string, insight: unknown) {
  const db = getDb();
  const expiresAt = new Date(Date.now() + config.insightTtlDays * 24 * 60 * 60 * 1000);
  const values = {
    productId,
    type,
    insight,
    expiresAt,
    createdAt: new Date(),
  };

  await withDbRetry(() =>
    db
      .insert(insights)
      .values(values)
      .onConflictDoUpdate({
        target: [insights.productId, insights.type],
        set: {
          insight: values.insight,
          expiresAt: values.expiresAt,
          createdAt: values.createdAt,
        },
      })
  );
}
