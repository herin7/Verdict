import type { BuyLink, ConsensusReport, ProductIdentity } from "./types";

/**
 * The floating-bubble product panel is hosted as its OWN React Native
 * surface (see VerdictPanelRoot.tsx / VerdictOverlayService.kt), not inside
 * AppInner's tree - so it can float over another app without ever bringing
 * MainActivity to the foreground. It shares the same running JS instance as
 * the main app, though, so "open full report" hands the already-fetched
 * report to AppInner through this plain in-memory singleton instead of
 * re-identifying/re-researching after switching activities.
 */
export type PendingFullReport = {
  report: ConsensusReport;
  product: ProductIdentity;
  buyLinks: BuyLink[];
  productId: string | null;
};

let pending: PendingFullReport | null = null;

export function requestOpenFullReport(payload: PendingFullReport): void {
  pending = payload;
}

export function consumePendingFullReport(): PendingFullReport | null {
  const p = pending;
  pending = null;
  return p;
}
