import { eq } from "drizzle-orm";
import { getDb, withDbRetry } from "../db/client.js";
import { buyerProfiles } from "../db/schema.js";
import { BuyerProfileSchema, type BuyerProfile } from "./schema.js";

/** The user's buyer profile, or null if they have none (or it no longer parses). */
export async function getProfile(userId: string): Promise<BuyerProfile | null> {
  const rows = await withDbRetry(() => getDb().select().from(buyerProfiles).where(eq(buyerProfiles.userId, userId)).limit(1));
  const parsed = BuyerProfileSchema.safeParse(rows[0]?.profile);
  return parsed.success ? parsed.data : null;
}

export async function saveProfile(userId: string, profile: BuyerProfile): Promise<void> {
  const updatedAt = new Date();
  await withDbRetry(() =>
    getDb()
      .insert(buyerProfiles)
      .values({ userId, profile, updatedAt })
      .onConflictDoUpdate({ target: buyerProfiles.userId, set: { profile, updatedAt } })
  );
}
