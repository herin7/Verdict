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

/**
 * Closes the floating product panel - a separate ReactSurface ("VerdictPanel")
 * hosted directly in its own overlay window by VerdictOverlayService, never
 * an Activity. Call this from within that surface (see VerdictPanelRoot).
 */
export function closePanel(): void {
  Native?.closePanel?.();
}

/**
 * Brings MainActivity to the foreground. The panel itself never does this -
 * it floats over whatever app is running without ever switching activities -
 * this is only for the deliberate "open full report" action.
 */
export function openMainApp(): void {
  Native?.openMainApp?.();
}

/**
 * Live-resizes the open panel window. `fraction` is 0-1 of screen height,
 * clamped natively to [PANEL_MIN_HEIGHT_FRACTION, PANEL_MAX_HEIGHT_FRACTION]
 * (see VerdictOverlayService.kt) - callers don't need to clamp themselves,
 * but should still throttle calls, since each one is a real window resize.
 */
export function resizePanel(fraction: number): void {
  Native?.resizePanel?.(fraction);
}

/** Animate panel height to a snap fraction after drag release. */
export function snapPanel(fraction: number): void {
  Native?.snapPanel?.(fraction);
}

/**
 * Fires when native reattaches an already-warm panel surface to a window
 * instead of recreating it from scratch (see VerdictOverlayService.showPanel/
 * reattachExistingPanel) - the surface's view is otherwise unchanged/stale
 * from its last open, so VerdictPanelRoot uses this to remount with a fresh
 * capture rather than showing whatever it last displayed.
 */
export function addPanelReopenListener(
  cb: (text: string, packageName: string) => void
): Sub {
  if (!Native?.addListener) return noopSub();
  return Native.addListener("onPanelReopen", (p: { text: string; packageName: string }) =>
    cb(p.text ?? "", p.packageName ?? "")
  );
}

/** Mirrors VerdictOverlayService.kt's PANEL_*_HEIGHT_FRACTION constants. */
export const PANEL_MIN_HEIGHT_FRACTION = 0.32;
export const PANEL_MAX_HEIGHT_FRACTION = 0.88;
export const PANEL_DEFAULT_HEIGHT_FRACTION = 0.56;

export const isOverlaySupported = Platform.OS === "android" && Native != null;
