import { Linking } from "react-native";

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
  flipkart: () => "flipkart://",
  myntra: () => "myntra://",
  ajio: () => "ajio://",
  nykaa: () => "nykaa://",
  meesho: () => "meesho://",
  snapdeal: () => "snapdeal://",
  blinkit: () => "blinkit://",
  zepto: () => "zepto://",
  bigbasket: () => "bigbasket://",
  walmart: () => "walmart://",
  target: () => "target://",
  bestbuy: () => "bestbuy://",
  ebay: () => "ebay://",
  instacart: () => "instacart://",
  gopuff: () => "gopuff://",
};

function inferRetailerId(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("amazon.in") || host.includes("amzn.in")) return "amazon_in";
    if (host.includes("amazon.com") || host.includes("amzn.to")) return "amazon_com";
    if (host.includes("flipkart")) return "flipkart";
    if (host.includes("myntra")) return "myntra";
    if (host.includes("ajio")) return "ajio";
    if (host.includes("nykaa")) return "nykaa";
    if (host.includes("meesho")) return "meesho";
    if (host.includes("snapdeal")) return "snapdeal";
    if (host.includes("blinkit")) return "blinkit";
    if (host.includes("zepto")) return "zepto";
    if (host.includes("bigbasket")) return "bigbasket";
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
  if (id && NATIVE_SCHEMES[id]) {
    const native = NATIVE_SCHEMES[id](url);
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
  await Linking.openURL(url);
}
