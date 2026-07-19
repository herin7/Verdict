import type { Country } from "./country";

export type RetailerKind = "marketplace" | "quick_commerce";

export interface RetailerMeta {
  id: string;
  name: string;
  kind: RetailerKind;
  packageHints?: string[];
}

const IN_RETAILERS: RetailerMeta[] = [
  { id: "amazon_in", name: "Amazon", kind: "marketplace", packageHints: ["amazon"] },
  { id: "flipkart", name: "Flipkart", kind: "marketplace", packageHints: ["flipkart"] },
  { id: "croma", name: "Croma", kind: "marketplace" },
  { id: "reliance_digital", name: "Reliance Digital", kind: "marketplace" },
  { id: "vijay_sales", name: "Vijay Sales", kind: "marketplace" },
  { id: "myntra", name: "Myntra", kind: "marketplace", packageHints: ["myntra"] },
  { id: "ajio", name: "AJIO", kind: "marketplace", packageHints: ["ajio"] },
  { id: "nykaa", name: "Nykaa", kind: "marketplace", packageHints: ["nykaa"] },
  { id: "tata_1mg", name: "Tata 1mg", kind: "marketplace" },
  { id: "blinkit", name: "Blinkit", kind: "quick_commerce", packageHints: ["blinkit", "grofers"] },
  { id: "zepto", name: "Zepto", kind: "quick_commerce", packageHints: ["zepto"] },
  { id: "bigbasket", name: "BigBasket", kind: "quick_commerce", packageHints: ["bigbasket"] },
  { id: "milkbasket", name: "Milkbasket", kind: "quick_commerce", packageHints: ["milkbasket"] },
  { id: "flipkart_minutes", name: "Flipkart Minutes", kind: "quick_commerce", packageHints: ["flipkart"] },
  { id: "swiggy_instamart", name: "Swiggy Instamart", kind: "quick_commerce", packageHints: ["swiggy", "instamart"] },
  { id: "meesho", name: "Meesho", kind: "marketplace", packageHints: ["meesho"] },
  { id: "snapdeal", name: "Snapdeal", kind: "marketplace", packageHints: ["snapdeal"] },
  { id: "tatacliq", name: "Tata CLiQ", kind: "marketplace" },
  { id: "ikea", name: "IKEA", kind: "marketplace" },
  { id: "pepperfry", name: "Pepperfry", kind: "marketplace" },
  { id: "firstcry", name: "FirstCry", kind: "marketplace" },
  { id: "headphonezone", name: "Headphone Zone", kind: "marketplace" },
];

/** Stable web domains for favicons - app/deep-link URLs often lack a usable host. */
const RETAILER_DOMAINS: Record<string, string> = {
  amazon_in: "amazon.in",
  amazon_com: "amazon.com",
  flipkart: "flipkart.com",
  flipkart_minutes: "flipkart.com",
  croma: "croma.com",
  reliance_digital: "reliancedigital.in",
  vijay_sales: "vijaysales.com",
  myntra: "myntra.com",
  ajio: "ajio.com",
  nykaa: "nykaa.com",
  tata_1mg: "1mg.com",
  blinkit: "blinkit.com",
  zepto: "zeptonow.com",
  bigbasket: "bigbasket.com",
  milkbasket: "milkbasket.com",
  swiggy_instamart: "swiggy.com",
  meesho: "meesho.com",
  snapdeal: "snapdeal.com",
  tatacliq: "tatacliq.com",
  ikea: "ikea.com",
  pepperfry: "pepperfry.com",
  firstcry: "firstcry.com",
  headphonezone: "headphonezone.in",
  walmart: "walmart.com",
  target: "target.com",
  bestbuy: "bestbuy.com",
  ebay: "ebay.com",
  instacart: "instacart.com",
  gopuff: "gopuff.com",
};

/** Favicon URL for a retailer; prefers canonical domain over deep-link hosts. */
export function retailerLogoUrl(retailerId: string, fallbackUrl?: string | null): string {
  const domain = RETAILER_DOMAINS[retailerId];
  if (domain) return `https://${domain}/`;
  if (fallbackUrl) return fallbackUrl;
  return "https://example.com/";
}

const US_RETAILERS: RetailerMeta[] = [
  { id: "amazon_com", name: "Amazon", kind: "marketplace", packageHints: ["amazon"] },
  { id: "walmart", name: "Walmart", kind: "marketplace", packageHints: ["walmart"] },
  { id: "target", name: "Target", kind: "marketplace", packageHints: ["target"] },
  { id: "bestbuy", name: "Best Buy", kind: "marketplace", packageHints: ["bestbuy"] },
  { id: "ebay", name: "eBay", kind: "marketplace", packageHints: ["ebay"] },
  { id: "instacart", name: "Instacart", kind: "quick_commerce", packageHints: ["instacart"] },
  { id: "gopuff", name: "Gopuff", kind: "quick_commerce", packageHints: ["gopuff"] },
];

const BY_COUNTRY: Record<Country, RetailerMeta[]> = {
  IN: IN_RETAILERS,
  US: US_RETAILERS,
};

export function retailersFor(country: Country): RetailerMeta[] {
  return BY_COUNTRY[country] ?? IN_RETAILERS;
}

export function retailerById(id: string, country: Country = "IN"): RetailerMeta | undefined {
  return (
    retailersFor(country).find((r) => r.id === id) ||
    IN_RETAILERS.find((r) => r.id === id) ||
    US_RETAILERS.find((r) => r.id === id)
  );
}

export function resolveRetailerIdFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    for (const [id, domain] of Object.entries(RETAILER_DOMAINS)) {
      if (host === domain || host.endsWith(`.${domain}`)) return id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function labelForPackage(packageName: string, country: Country = "IN"): string {
  const pkg = packageName.toLowerCase();
  for (const r of retailersFor(country)) {
    if (r.packageHints?.some((h) => pkg.includes(h))) return r.name;
  }
  if (pkg.includes("amazon")) return "Amazon";
  return "shopping";
}

/**
 * The single "hide mismatches" gate on the app side (mirrors the server's
 * filterOffersByCurrency in marketplaces/normalize.ts - the server should
 * already have filtered these, but this is the last line of defense before
 * render). An offer whose currency doesn't match the user's own country
 * currency is DROPPED, never relabeled: swapping the displayed symbol on a
 * foreign-currency amount would show a wrong PRICE (a $199 listing rendered
 * as "₹199" reads as impossibly cheap), which is worse than not showing it.
 */
export function filterOffersByCurrency<T extends { currency?: string | null }>(
  offers: T[],
  currency: string
): T[] {
  return offers.filter((o) => !o.currency || o.currency === currency);
}

/** Mirror server filterPricedOffers: drop missing platforms / check-manually shells. */
export function filterPricedOffers<
  T extends { price?: number | null; checkManually?: boolean; matchReason?: string },
>(offers: T[]): T[] {
  return offers.filter(
    (o) => !o.checkManually && o.matchReason !== "check_manually" && o.price != null && o.price > 0
  );
}

/** Available priced first, then OOS-with-price, then by amount. */
export function sortOffersForDeals<T extends { price?: number | null; inStock?: boolean | null }>(
  offers: T[]
): T[] {
  return [...offers].sort((a, b) => {
    const stockRank = (o: T) => (o.inStock === false ? 1 : 0);
    const d = stockRank(a) - stockRank(b);
    if (d !== 0) return d;
    return (a.price ?? Infinity) - (b.price ?? Infinity);
  });
}

export function groupOffersByKind<T extends { retailerId: string }>(
  offers: T[],
  country: Country
): { marketplaces: T[]; quickCommerce: T[] } {
  const meta = new Map(retailersFor(country).map((r) => [r.id, r.kind]));
  const marketplaces: T[] = [];
  const quickCommerce: T[] = [];
  for (const o of offers) {
    if (meta.get(o.retailerId) === "quick_commerce") quickCommerce.push(o);
    else marketplaces.push(o);
  }
  return { marketplaces, quickCommerce };
}
