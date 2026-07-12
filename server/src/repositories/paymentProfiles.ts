import { eq } from "drizzle-orm";
import { dbAvailable, getDb, withDbRetry } from "../db/client.js";
import { paymentProfiles } from "../db/schema.js";
import type { PaymentMethodId } from "../deals/offers.js";

export async function getPaymentProfile(userId: string): Promise<PaymentMethodId[]> {
  if (!dbAvailable()) return [];
  const db = getDb();
  const rows = await withDbRetry(() =>
    db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, userId)).limit(1)
  );
  if (!rows[0]) return [];
  return (rows[0].methods as PaymentMethodId[]) ?? [];
}

export async function savePaymentProfile(
  userId: string,
  methods: PaymentMethodId[]
): Promise<void> {
  if (!dbAvailable()) throw new Error("Database not configured");
  const db = getDb();
  await withDbRetry(() =>
    db
      .insert(paymentProfiles)
      .values({ userId, methods, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: paymentProfiles.userId,
        set: { methods, updatedAt: new Date() },
      })
  );
}
