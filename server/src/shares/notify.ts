import { eq } from "drizzle-orm";
import { getDb, withDbRetry } from "../db/client.js";
import { devices } from "../db/schema.js";
import { logger } from "../logging/logger.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function registerDevice(userId: string, expoToken: string, platform: string | null) {
  await withDbRetry(() =>
    getDb()
      .insert(devices)
      .values({ expoToken, userId, platform })
      .onConflictDoUpdate({ target: devices.expoToken, set: { userId, platform, updatedAt: new Date() } })
  );
}

/**
 * Sends one push to every device of the user via Expo's push service (which
 * relays to FCM/APNs). `data.url` is the deep link the app opens on tap.
 * Never throws: a failed notification must not fail the share.
 */
export async function notifyUser(userId: string, message: { title: string; body: string; url: string }): Promise<number> {
  try {
    const rows = await withDbRetry(() => getDb().select().from(devices).where(eq(devices.userId, userId)));
    if (rows.length === 0) return 0;
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        rows.map((d) => ({
          to: d.expoToken,
          title: message.title,
          body: message.body,
          data: { url: message.url },
          sound: "default",
          channelId: "verdicts",
        }))
      ),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { status: string; details?: { error?: string } }[] };
    // Expo reports per-token errors; drop tokens for uninstalled apps.
    for (const [i, ticket] of (json.data ?? []).entries()) {
      if (ticket.details?.error === "DeviceNotRegistered") {
        await withDbRetry(() => getDb().delete(devices).where(eq(devices.expoToken, rows[i].expoToken))).catch(() => {});
      }
    }
    return rows.length;
  } catch (err) {
    logger.warn({ err, userId }, "push_failed");
    return 0;
  }
}
