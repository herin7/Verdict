/**
 * Curated allowlist of shopping app package names the accessibility service
 * is allowed to read from. Everything not on this list - personal apps,
 * messaging, banking, gallery, etc. - is never read, by construction (see
 * VerdictAccessibilityService.kt), not just filtered client-side.
 *
 * Package names verified against their Play Store listings. Add more here
 * as needed; nothing else changes.
 */
export interface WatchedApp {
  id: string;
  label: string;
  packageName: string;
}

export const WATCHED_SHOPPING_APPS: WatchedApp[] = [
  { id: "amazon", label: "Amazon", packageName: "in.amazon.mShop.android.shopping" },
  { id: "amazon-global", label: "Amazon (global)", packageName: "com.amazon.mShop.android.shopping" },
  { id: "flipkart", label: "Flipkart", packageName: "com.flipkart.android" },
  { id: "myntra", label: "Myntra", packageName: "com.myntra.android" },
  { id: "ajio", label: "Ajio", packageName: "com.ril.ajio" },
  { id: "meesho", label: "Meesho", packageName: "com.meesho.supply" },
  { id: "nykaa", label: "Nykaa", packageName: "com.fsn.nykaa" },
  { id: "snapdeal", label: "Snapdeal", packageName: "com.snapdeal.main" },
];

export const WATCHED_PACKAGE_NAMES: string[] = WATCHED_SHOPPING_APPS.map((a) => a.packageName);
