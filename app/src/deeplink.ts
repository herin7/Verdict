import { Linking } from "react-native";

/**
 * Marketplaces with a documented, path-preserving custom URI scheme - safe to
 * try before the plain web URL because they reliably deep-link straight to the
 * product (not just the app's home screen). Everything else is opened via its
 * real https URL directly below, letting Android App Links (where the platform
 * has them configured) route straight to the right in-app page; if the app
 * isn't installed or doesn't own the App Link, the browser opens that exact
 * page instead - never just a bare app-open that lands on the home screen.
 */
const NATIVE_SCHEMES: Record<string, (webUrl: string) => string | null> = {
  amazon_in: (url) => {
    try {
      const u = new URL(url);
      return `amzn://apps/android?asinPath=${encodeURIComponent(u.pathname + u.search)}`;
    } catch {
      return "amzn://apps/android";
    }
  },
  amazon_com: (url) => {
    try {
      const u = new URL(url);
      return `com.amazon.mobile.shopping://www.amazon.com${u.pathname}${u.search}`;
    } catch {
      return "com.amazon.mobile.shopping://www.amazon.com";
    }
  },
};

/**
 * Rewrites a web URL onto a dedicated deep-link domain before opening, so the
 * full path/query (product page or search) survives instead of just opening
 * the app's home screen.
 */
const URL_REWRITES: Record<string, (webUrl: string) => string> = {
  // dl.flipkart.com is Flipkart's own deep-link domain (used for their affiliate
  // program): prefixing the path with /dl routes straight to the same
  // product/search page in-app, and falls back to the mobile site if the app
  // isn't installed. Flipkart Minutes is a tab inside the same app/domain, so
  // it shares this - there's no separate Minutes catalog/scheme (mid-2026).
  flipkart: toFlipkartDeepLink,
  flipkart_minutes: toFlipkartDeepLink,
};

function toFlipkartDeepLink(url: string): string {
  try {
    const u = new URL(url);
    return `https://dl.flipkart.com/dl${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

/** Android package names, used as a Play Store fallback when neither the native
 *  scheme nor the web URL can open the app (e.g. app not installed). */
const PACKAGE_NAMES: Record<string, string> = {
  amazon_in: "in.amazon.mShop.android.shopping",
  flipkart: "com.flipkart.android",
  flipkart_minutes: "com.flipkart.android",
  blinkit: "com.grofers.customerapp",
  zepto: "com.zeptoconsumerapp",
  bigbasket: "com.bigbasket.mobileapp",
  milkbasket: "com.milkbasket.app",
  swiggy_instamart: "in.swiggy.android.instamart",
};

/** Play Store link for a retailer, used as a last-resort fallback when the app
 *  isn't installed and no useful web fallback exists (e.g. Milkbasket). */
export function playStoreUrl(retailerId: string): string | null {
  const pkg = PACKAGE_NAMES[retailerId];
  return pkg ? `https://play.google.com/store/apps/details?id=${pkg}` : null;
}

function inferRetailerId(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("amazon.in") || host.includes("amzn.in")) return "amazon_in";
    if (host.includes("amazon.com") || host.includes("amzn.to")) return "amazon_com";
    if (host.includes("dl.flipkart") || host.includes("flipkart")) return "flipkart";
    if (host.includes("myntra")) return "myntra";
    if (host.includes("ajio")) return "ajio";
    if (host.includes("nykaa")) return "nykaa";
    if (host.includes("meesho")) return "meesho";
    if (host.includes("snapdeal")) return "snapdeal";
    if (host.includes("blinkit")) return "blinkit";
    if (host.includes("zepto")) return "zepto";
    if (host.includes("bigbasket")) return "bigbasket";
    if (host.includes("milkbasket")) return "milkbasket";
    if (host.includes("swiggy")) return "swiggy_instamart";
    if (host.includes("walmart")) return "walmart";
    if (host.includes("target")) return "target";
    if (host.includes("bestbuy")) return "bestbuy";
    if (host.includes("ebay")) return "ebay";
    if (host.includes("instacart")) return "instacart";
    if (host.includes("gopuff")) return "gopuff";
  } catch {
    /* ignore */
  }
  return null;
}

export async function openRetailer(url: string, retailerId?: string | null): Promise<void> {
  const id = retailerId || inferRetailerId(url);
  // Rewrite onto a deep-link domain (e.g. Flipkart) before doing anything else,
  // so every subsequent attempt (native scheme, plain open, fallback) targets
  // the real product/search destination rather than a generic homepage.
  const target = id && URL_REWRITES[id] ? URL_REWRITES[id](url) : url;

  if (id && NATIVE_SCHEMES[id]) {
    const native = NATIVE_SCHEMES[id](target);
    if (native) {
      try {
        const can = await Linking.canOpenURL(native);
        if (can) {
          await Linking.openURL(native);
          return;
        }
      } catch {
        /* fall through to web */
      }
    }
  }
  try {
    await Linking.openURL(target);
  } catch {
    const store = id ? playStoreUrl(id) : null;
    if (store) await Linking.openURL(store);
    else throw new Error("Could not open retailer");
  }
}
