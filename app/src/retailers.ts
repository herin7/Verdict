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
  return retailersFor(country).find((r) => r.id === id);
}

export function labelForPackage(packageName: string, country: Country = "IN"): string {
  const pkg = packageName.toLowerCase();
  for (const r of retailersFor(country)) {
    if (r.packageHints?.some((h) => pkg.includes(h))) return r.name;
  }
  if (pkg.includes("amazon")) return "Amazon";
  return "shopping";
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
