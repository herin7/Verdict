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
}

/** India MVP allowlist - used for URL validation and Compare Everywhere. */
export const MARKETPLACES: Marketplace[] = [
  { id: "amazon_in", name: "Amazon", domains: ["amazon.in", "amzn.in", "amzn.to"], categories: ["general", "electronics", "books"] },
  { id: "flipkart", name: "Flipkart", domains: ["flipkart.com", "dl.flipkart.com"], categories: ["general", "electronics"] },
  { id: "croma", name: "Croma", domains: ["croma.com"], categories: ["electronics"] },
  { id: "reliance_digital", name: "Reliance Digital", domains: ["reliancedigital.in"], categories: ["electronics"] },
  { id: "vijay_sales", name: "Vijay Sales", domains: ["vijaysales.com"], categories: ["electronics"] },
  { id: "myntra", name: "Myntra", domains: ["myntra.com"], categories: ["fashion"] },
  { id: "ajio", name: "AJIO", domains: ["ajio.com"], categories: ["fashion"] },
  { id: "nykaa", name: "Nykaa", domains: ["nykaa.com", "nykaafashion.com"], categories: ["beauty", "fashion"] },
  { id: "tata_1mg", name: "Tata 1mg", domains: ["1mg.com"], categories: ["pharmacy"] },
  { id: "blinkit", name: "Blinkit", domains: ["blinkit.com"], categories: ["grocery"] },
  { id: "zepto", name: "Zepto", domains: ["zeptonow.com"], categories: ["grocery"] },
  { id: "bigbasket", name: "BigBasket", domains: ["bigbasket.com"], categories: ["grocery"] },
  { id: "meesho", name: "Meesho", domains: ["meesho.com"], categories: ["general", "fashion"] },
  { id: "snapdeal", name: "Snapdeal", domains: ["snapdeal.com"], categories: ["general"] },
  { id: "tatacliq", name: "Tata CLiQ", domains: ["tatacliq.com"], categories: ["general", "electronics"] },
  { id: "ikea", name: "IKEA", domains: ["ikea.com"], categories: ["home"] },
  { id: "pepperfry", name: "Pepperfry", domains: ["pepperfry.com"], categories: ["home"] },
  { id: "firstcry", name: "FirstCry", domains: ["firstcry.com"], categories: ["baby"] },
  { id: "headphonezone", name: "Headphone Zone", domains: ["headphonezone.in"], categories: ["electronics"] },
];

const DOMAIN_TO_MARKETPLACE = new Map<string, Marketplace>();
for (const m of MARKETPLACES) {
  for (const d of m.domains) DOMAIN_TO_MARKETPLACE.set(d.toLowerCase(), m);
}

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function findMarketplace(url: string): Marketplace | null {
  const host = hostnameOf(url);
  if (!host) return null;
  const exact = DOMAIN_TO_MARKETPLACE.get(host);
  if (exact) return exact;
  for (const [domain, m] of DOMAIN_TO_MARKETPLACE) {
    if (host.endsWith(`.${domain}`) || host === domain) return m;
  }
  return null;
}

export function isAllowedMarketplaceUrl(url: string): boolean {
  return findMarketplace(url) !== null;
}

export function allMarketplaceDomains(): string[] {
  return MARKETPLACES.flatMap((m) => m.domains);
}
