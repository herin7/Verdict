import { Platform } from "react-native";

type Sub = { remove: () => void };

const noopSub = (): Sub => ({ remove: () => {} });

function loadNative(): any | null {
  if (Platform.OS !== "android") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeModule } = require("expo-modules-core");
    return requireNativeModule("VerdictOverlay");
  } catch {
    return null;
  }
}

const Native = loadNative();

export function canDrawOverlays(): boolean {
  return Native?.canDrawOverlays?.() ?? false;
}

export function requestOverlayPermission(): void {
  Native?.requestOverlayPermission?.();
}

export function showBubble(): void {
  Native?.showBubble?.();
}

export function hideBubble(): void {
  Native?.hideBubble?.();
}

export function isBubbleVisible(): boolean {
  return Native?.isBubbleVisible?.() ?? false;
}

/** Pulse ring around bubble when local heuristics say user is on a PDP. Zero tokens. */
export function setBubbleHot(hot: boolean): void {
  Native?.setBubbleHot?.(hot);
}

/** Make the host Activity translucent so the previous shopping app shows through. */
export function setPanelTranslucent(translucent: boolean): void {
  Native?.setPanelTranslucent?.(translucent);
}

/** Send the app task to the background (return to shopping app). */
export function moveTaskToBack(): void {
  Native?.moveTaskToBack?.();
}

/** Read+clear panel launch extras from the Activity intent (cold start). */
export function consumePanelIntent(): {
  panel: boolean;
  text?: string | null;
  packageName?: string | null;
} | null {
  const raw = Native?.consumePanelIntent?.();
  if (!raw || typeof raw !== "object") return null;
  if (!raw.panel) return null;
  return {
    panel: true,
    text: (raw.text as string | null) ?? null,
    packageName: (raw.packageName as string | null) ?? null,
  };
}

export function addBubbleTapListener(
  cb: (payload: { text?: string | null; packageName?: string | null; panel?: boolean }) => void
): Sub {
  if (!Native?.addListener) return noopSub();
  return Native.addListener(
    "onBubbleTap",
    (p: { text?: string | null; packageName?: string | null; panel?: boolean } = {}) => cb(p ?? {})
  );
}

export const isOverlaySupported = Platform.OS === "android" && Native != null;
