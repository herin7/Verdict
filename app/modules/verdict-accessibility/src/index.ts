import { Platform } from "react-native";

type Sub = { remove: () => void };
const noopSub = (): Sub => ({ remove: () => {} });

function loadNative(): any | null {
  if (Platform.OS !== "android") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeModule } = require("expo-modules-core");
    return requireNativeModule("VerdictAccessibility");
  } catch {
    return null;
  }
}

const Native = loadNative();

export function isAccessibilityServiceEnabled(): boolean {
  return Native?.isServiceEnabled?.() ?? false;
}

export function openAccessibilitySettings(): void {
  Native?.openAccessibilitySettings?.();
}

export function getLastScreenText(): string | null {
  return Native?.getLastScreenText?.() ?? null;
}

export function getLastPackageName(): string | null {
  return Native?.getLastPackageName?.() ?? null;
}

/**
 * Restricts what the accessibility service will ever read to this list of
 * package names. Everything else (personal apps, banking, messaging, etc.)
 * is skipped natively and never reaches JS.
 */
export function setWatchlist(packages: string[]): void {
  Native?.setWatchlist?.(packages);
}

export function addScreenTextListener(cb: (text: string, packageName: string) => void): Sub {
  if (!Native?.addListener) return noopSub();
  return Native.addListener("onScreenText", (p: { text: string; packageName: string }) =>
    cb(p.text, p.packageName)
  );
}

/** Fires once when the foreground app leaves the watchlist (product session ended). */
export function addLeftShoppingAppListener(cb: () => void): Sub {
  if (!Native?.addListener) return noopSub();
  return Native.addListener("onLeftShoppingApp", () => cb());
}

export const isAccessibilitySupported = Platform.OS === "android" && Native != null;
