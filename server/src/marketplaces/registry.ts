export type Country = "IN" | "US";
export type MarketplaceKind = "marketplace" | "quick_commerce";

export type MarketplaceCategory =
  | "general"
  | "electronics"
  | "fashion"
  | "beauty"
  | "pharmacy"
  | "grocery"
  | "home"
  | "books"
  | "pet"
  | "baby"
  | "auto"
  | "sports";

export interface Marketplace {
  id: string;
  name: string;
  domains: string[];
  categories: MarketplaceCategory[];
  kind: MarketplaceKind;
}

const IN_MARKETPLACES: Marketplace[] = [
  { id: "amazon_in", name: "Amazon", domains: ["amazon.in", "amzn.in", "amzn.to"], categories: ["general", "electronics", "books"], kind: "marketplace" },
  { id: "flipkart", name: "Flipkart", domains: ["flipkart.com", "dl.flipkart.com"], categories: ["general", "electronics"], kind: "marketplace" },
  { id: "croma", name: "Croma", domains: ["croma.com"], categories: ["electronics"], kind: "marketplace" },
  { id: "reliance_digital", name: "Reliance Digital", domains: ["reliancedigital.in"], categories: ["electronics"], kind: "marketplace" },
  { id: "vijay_sales", name: "Vijay Sales", domains: ["vijaysales.com"], categories: ["electronics"], kind: "marketplace" },
  { id: "myntra", name: "Myntra", domains: ["myntra.com"], categories: ["fashion"], kind: "marketplace" },
  { id: "ajio", name: "AJIO", domains: ["ajio.com"], categories: ["fashion"], kind: "marketplace" },
  { id: "nykaa", name: "Nykaa", domains: ["nykaa.com", "nykaafashion.com"], categories: ["beauty", "fashion"], kind: "marketplace" },
  { id: "tata_1mg", name: "Tata 1mg", domains: ["1mg.com"], categories: ["pharmacy"], kind: "marketplace" },
  { id: "blinkit", name: "Blinkit", domains: ["blinkit.com"], categories: ["grocery"], kind: "quick_commerce" },
  { id: "zepto", name: "Zepto", domains: ["zeptonow.com"], categories: ["grocery"], kind: "quick_commerce" },
  { id: "bigbasket", name: "BigBasket", domains: ["bigbasket.com"], categories: ["grocery"], kind: "quick_commerce" },
  { id: "meesho", name: "Meesho", domains: ["meesho.com"], categories: ["general", "fashion"], kind: "marketplace" },
  { id: "snapdeal", name: "Snapdeal", domains: ["snapdeal.com"], categories: ["general"], kind: "marketplace" },
  { id: "tatacliq", name: "Tata CLiQ", domains: ["tatacliq.com"], categories: ["general", "electronics"], kind: "marketplace" },
  { id: "ikea", name: "IKEA", domains: ["ikea.com"], categories: ["home"], kind: "marketplace" },
  { id: "pepperfry", name: "Pepperfry", domains: ["pepperfry.com"], categories: ["home"], kind: "marketplace" },
  { id: "firstcry", name: "FirstCry", domains: ["firstcry.com"], categories: ["baby"], kind: "marketplace" },
  { id: "headphonezone", name: "Headphone Zone", domains: ["headphonezone.in"], categories: ["electronics"], kind: "marketplace" },
];

const US_MARKETPLACES: Marketplace[] = [
  { id: "amazon_com", name: "Amazon", domains: ["amazon.com", "amzn.to", "a.co"], categories: ["general", "electronics", "books"], kind: "marketplace" },
  { id: "walmart", name: "Walmart", domains: ["walmart.com"], categories: ["general", "electronics", "grocery"], kind: "marketplace" },
  { id: "target", name: "Target", domains: ["target.com"], categories: ["general", "electronics", "home"], kind: "marketplace" },
  { id: "bestbuy", name: "Best Buy", domains: ["bestbuy.com"], categories: ["electronics"], kind: "marketplace" },
  { id: "ebay", name: "eBay", domains: ["ebay.com"], categories: ["general"], kind: "marketplace" },
  { id: "instacart", name: "Instacart", domains: ["instacart.com"], categories: ["grocery"], kind: "quick_commerce" },
  { id: "gopuff", name: "Gopuff", domains: ["gopuff.com"], categories: ["grocery"], kind: "quick_commerce" },
];

/** Per-country marketplace allowlists. */
export const MARKETPLACES: Record<Country, Marketplace[]> = {
  IN: IN_MARKETPLACES,
  US: US_MARKETPLACES,
};

/** Flat list for callers that still expect an array (defaults to India). */
export const MARKETPLACES_FLAT: Marketplace[] = [...IN_MARKETPLACES, ...US_MARKETPLACES];

export function normalizeCountry(raw: unknown): Country {
  return raw === "US" ? "US" : "IN";
}

export function marketplacesFor(country: Country = "IN"): Marketplace[] {
  return MARKETPLACES[country] ?? IN_MARKETPLACES;
}

function buildDomainIndex(list: Marketplace[]): Map<string, Marketplace> {
  const map = new Map<string, Marketplace>();
  for (const m of list) {
    for (const d of m.domains) map.set(d.toLowerCase(), m);
  }
  return map;
}

const DOMAIN_INDEX: Record<Country, Map<string, Marketplace>> = {
  IN: buildDomainIndex(IN_MARKETPLACES),
  US: buildDomainIndex(US_MARKETPLACES),
};

const ALL_DOMAINS = buildDomainIndex(MARKETPLACES_FLAT);

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function lookupIn(map: Map<string, Marketplace>, host: string): Marketplace | null {
  const exact = map.get(host);
  if (exact) return exact;
  for (const [domain, m] of map) {
    if (host.endsWith(`.${domain}`) || host === domain) return m;
  }
  return null;
}

export function findMarketplace(url: string, country?: Country): Marketplace | null {
  const host = hostnameOf(url);
  if (!host) return null;
  if (country) return lookupIn(DOMAIN_INDEX[country], host);
  return lookupIn(ALL_DOMAINS, host);
}

export function isAllowedMarketplaceUrl(url: string, country?: Country): boolean {
  return findMarketplace(url, country) !== null;
}

export function allMarketplaceDomains(country?: Country): string[] {
  const list = country ? marketplacesFor(country) : MARKETPLACES_FLAT;
  return list.flatMap((m) => m.domains);
}

export function currencyFor(country: Country): "INR" | "USD" {
  return country === "US" ? "USD" : "INR";
}

export function priceRegexFor(country: Country): RegExp {
  return country === "US"
    ? /(?:\$|USD\s*)[\d,]+(?:\.\d{1,2})?/i
    : /(?:₹|Rs\.?\s*|INR\s*)[\d,]+(?:\.\d{1,2})?/i;
}
