export type Country = "IN" | "US";

/**
 * Stores whose product links Verdict can read. Used only to recognise a
 * shared/pasted product link and label where it came from - Verdict does not
 * crawl or compare these stores.
 */
export interface Store {
  id: string;
  name: string;
  category: string;
  domains: string[];
}

const STORES: Record<Country, Store[]> = {
  IN: [
    { id: "amazon_in", name: "Amazon", category: "general", domains: ["amazon.in",  "amzn.in",  "amzn.to"] },
    { id: "flipkart", name: "Flipkart", category: "general", domains: ["flipkart.com",  "dl.flipkart.com"] },
    { id: "croma", name: "Croma", category: "electronics", domains: ["croma.com"] },
    { id: "reliance_digital", name: "Reliance Digital", category: "electronics", domains: ["reliancedigital.in"] },
    { id: "vijay_sales", name: "Vijay Sales", category: "electronics", domains: ["vijaysales.com"] },
    { id: "myntra", name: "Myntra", category: "fashion", domains: ["myntra.com"] },
    { id: "ajio", name: "AJIO", category: "fashion", domains: ["ajio.com"] },
    { id: "nykaa", name: "Nykaa", category: "beauty", domains: ["nykaa.com",  "nykaafashion.com"] },
    { id: "tata_1mg", name: "Tata 1mg", category: "pharmacy", domains: ["1mg.com"] },
    { id: "blinkit", name: "Blinkit", category: "grocery", domains: ["blinkit.com"] },
    { id: "zepto", name: "Zepto", category: "grocery", domains: ["zeptonow.com",  "zepto.com"] },
    { id: "bigbasket", name: "BigBasket", category: "grocery", domains: ["bigbasket.com"] },
    { id: "swiggy_instamart", name: "Swiggy Instamart", category: "grocery", domains: ["swiggy.com"] },
    { id: "meesho", name: "Meesho", category: "general", domains: ["meesho.com"] },
    { id: "snapdeal", name: "Snapdeal", category: "general", domains: ["snapdeal.com"] },
    { id: "tatacliq", name: "Tata CLiQ", category: "general", domains: ["tatacliq.com"] },
    { id: "ikea", name: "IKEA", category: "home", domains: ["ikea.com"] },
    { id: "pepperfry", name: "Pepperfry", category: "home", domains: ["pepperfry.com"] },
    { id: "firstcry", name: "FirstCry", category: "baby", domains: ["firstcry.com"] },
    { id: "headphonezone", name: "Headphone Zone", category: "electronics", domains: ["headphonezone.in"] },
  ],
  US: [
    { id: "amazon_com", name: "Amazon", category: "general", domains: ["amazon.com",  "amzn.to",  "a.co"] },
    { id: "walmart", name: "Walmart", category: "general", domains: ["walmart.com"] },
    { id: "target", name: "Target", category: "general", domains: ["target.com"] },
    { id: "bestbuy", name: "Best Buy", category: "electronics", domains: ["bestbuy.com"] },
    { id: "ebay", name: "eBay", category: "general", domains: ["ebay.com"] },
    { id: "instacart", name: "Instacart", category: "grocery", domains: ["instacart.com"] },
    { id: "gopuff", name: "Gopuff", category: "grocery", domains: ["gopuff.com"] },
  ],
};

export function normalizeCountry(raw: unknown): Country {
  return raw === "US" ? "US" : "IN";
}

export function currencyFor(country: Country): "INR" | "USD" {
  return country === "US" ? "USD" : "INR";
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** The store a product link belongs to (subdomains included), or null. */
export function findMarketplace(url: string, country?: Country): Store | null {
  const host = hostnameOf(url);
  if (!host) return null;
  const stores = country ? STORES[country] : [...STORES.IN, ...STORES.US];
  return stores.find((s) => s.domains.some((d) => host === d || host.endsWith(`.${d}`))) ?? null;
}

export function isAllowedMarketplaceUrl(url: string, country?: Country): boolean {
  return findMarketplace(url, country) !== null;
}
