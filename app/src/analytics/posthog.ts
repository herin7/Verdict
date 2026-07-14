import PostHog from "posthog-react-native";

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() ?? "";
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

export const posthogConfigured = Boolean(apiKey);

// Manual client only - no PostHogProvider, so no autocapture/touch/screen
// tracking and no session replay. Soft-disabled (no-op) when the key is unset.
export const posthog = posthogConfigured
  ? new PostHog(apiKey, {
      host,
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
    })
  : null;

type AnalyticsValue = string | number | boolean | null | undefined;

export function track(event: string, properties?: Record<string, AnalyticsValue>): void {
  if (!posthog) return;
  try {
    posthog.capture(event, properties as Record<string, string | number | boolean | null>);
  } catch {
    // analytics must never break app behavior
  }
}

export function identify(userId: string): void {
  if (!posthog) return;
  try {
    posthog.identify(userId);
  } catch {
    // analytics must never break app behavior
  }
}

export function resetAnalytics(): void {
  if (!posthog) return;
  try {
    posthog.reset();
  } catch {
    // analytics must never break app behavior
  }
}
