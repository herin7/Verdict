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

export function addBubbleTapListener(cb: () => void): Sub {
  if (!Native?.addListener) return noopSub();
  return Native.addListener("onBubbleTap", cb);
}

export const isOverlaySupported = Platform.OS === "android" && Native != null;
