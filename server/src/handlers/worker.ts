import { processShare } from "../shares/process.js";

/**
 * Lambda entry for background work, invoked asynchronously by the API with
 * { shareId }. Throwing makes Lambda retry (up to 2 more times).
 */
export async function handler(event: { shareId?: string }): Promise<void> {
  if (!event?.shareId) return;
  await processShare(event.shareId);
}
