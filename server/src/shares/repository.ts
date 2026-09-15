import { and, desc, eq, gt, gte, inArray } from "drizzle-orm";
import { getDb, withDbRetry } from "../db/client.js";
import { reports, shares } from "../db/schema.js";
import type { ProductIdentity } from "../schema.js";
import type { ShareKind, ShareStatus } from "./types.js";

export type ShareRow = typeof shares.$inferSelect;

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Creates the share, or returns the existing one when this is a retry of the
 * same request (same clientId) or a repeat of the same content within 24h.
 */
export async function createShare(input: {
  userId: string;
  clientId: string;
  kind: ShareKind;
  contentHash: string;
  inputText: string | null;
  inputUrl: string | null;
  imageKey: string | null;
}): Promise<{ share: ShareRow; created: boolean }> {
  const db = getDb();

  const repeat = await withDbRetry(() =>
    db
      .select()
      .from(shares)
      .where(
        and(
          eq(shares.userId, input.userId),
          eq(shares.contentHash, input.contentHash),
          gte(shares.createdAt, new Date(Date.now() - DEDUPE_WINDOW_MS))
        )
      )
      .orderBy(desc(shares.createdAt))
      .limit(1)
  );
  if (repeat[0] && repeat[0].status !== "failed") return { share: repeat[0], created: false };

  const inserted = await withDbRetry(() =>
    db.insert(shares).values(input).onConflictDoNothing({ target: [shares.userId, shares.clientId] }).returning()
  );
  if (inserted[0]) return { share: inserted[0], created: true };

  // Same clientId already stored: this was a retried request.
  const existing = await getShareForUser(input.userId, null, input.clientId);
  if (!existing) throw new Error("share insert conflicted but no row found");
  return { share: existing, created: false };
}

export async function getShare(id: string): Promise<ShareRow | null> {
  const rows = await withDbRetry(() => getDb().select().from(shares).where(eq(shares.id, id)).limit(1));
  return rows[0] ?? null;
}

export async function getShareForUser(userId: string, id: string | null, clientId?: string): Promise<ShareRow | null> {
  const where = id
    ? and(eq(shares.userId, userId), eq(shares.id, id))
    : and(eq(shares.userId, userId), eq(shares.clientId, clientId!));
  const rows = await withDbRetry(() => getDb().select().from(shares).where(where).limit(1));
  return rows[0] ?? null;
}

/** The inbox. `since` returns only rows that changed, for cheap polling. */
export async function listShares(userId: string, since?: Date): Promise<ShareRow[]> {
  const where = since ? and(eq(shares.userId, userId), gt(shares.updatedAt, since)) : eq(shares.userId, userId);
  return withDbRetry(() => getDb().select().from(shares).where(where).orderBy(desc(shares.createdAt)).limit(100));
}

export async function updateShare(
  id: string,
  patch: Partial<{
    status: ShareStatus;
    stage: string | null;
    extractedText: string | null;
    product: ProductIdentity | null;
    productId: string | null;
    error: string | null;
    attempts: number;
    timings: Record<string, number>;
    notifiedAt: Date;
    inputText: string | null;
  }>
) {
  await withDbRetry(() =>
    getDb()
      .update(shares)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(shares.id, id))
  );
}

export async function deleteShare(userId: string, id: string) {
  await withDbRetry(() => getDb().delete(shares).where(and(eq(shares.userId, userId), eq(shares.id, id))));
}

/** Report payloads for ready shares, keyed by product id (one query for the whole inbox). */
export async function reportsFor(productIds: string[]) {
  if (productIds.length === 0) return new Map<string, unknown>();
  const rows = await withDbRetry(() =>
    getDb()
      .select({ productId: reports.productId, report: reports.report })
      .from(reports)
      .where(inArray(reports.productId, productIds))
  );
  return new Map(rows.map((r) => [r.productId, r.report]));
}
