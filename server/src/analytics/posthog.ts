import { PostHog } from "posthog-node";
import { config } from "../config.js";

let client: PostHog | undefined;

function getClient(): PostHog | undefined {
  if (!config.posthogEnabled) return undefined;
  if (!client) {
    client = new PostHog(config.posthogApiKey, { host: config.posthogHost });
  }
  return client;
}

/** No-ops cleanly when POSTHOG_API_KEY is unset. distinctId is required by PostHog - pass a stable id when you have one, or a generic fallback like "server". */
export function capture(event: string, distinctId: string, properties?: Record<string, unknown>): void {
  const c = getClient();
  if (!c) return;
  c.capture({ distinctId, event, properties });
}

/** Flush and close the PostHog client. Call once on server shutdown. */
export async function shutdownPosthog(): Promise<void> {
  if (client) await client.shutdown();
}
