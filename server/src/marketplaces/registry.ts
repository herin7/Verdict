import type { FirecrawlAction } from "../firecrawl.js";

export type Country = "IN" | "US";
export type MarketplaceKind = "marketplace" | "quick_commerce";

/**
 * Live price/availability capability per marketplace.
 * - "scrape": worth attempting via the orchestrator (search + Firecrawl extract).
 * - "deeplinkOnly": no reliable public catalog/API (app-only, signed/session-gated,
 *   aggressive anti-bot) - surface as a "check manually" deep link instead of
 *   wasting requests on scrape attempts that would produce stale/wrong prices.
 * Unset defaults to "scrape" - preserves existing behavior for marketplaces
 * registered before this field existed (Amazon, Flipkart, etc).
 */
export type MarketplaceCapability = "scrape" | "deeplinkOnly";

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
  capability?: MarketplaceCapability;
  /**
   * Scrape-capable platforms that aggressively block datacenter IPs, so a plain
   * scrape reliably 403s - request Firecrawl's enhanced/stealth proxy instead of
   * wasting a basic-proxy attempt.
   */
  antiBotStealth?: boolean;
  /** Homepage URL surfaced for deeplinkOnly platforms when no query/searchUrl is
   *  available. Defaults to https://{domains[0]}. */
  manualUrl?: string;
  /** Builds a real in-app search URL (not just the homepage) for a deeplinkOnly
   *  platform, given the product's search term - documented per platform. */
  searchUrl?: (query: string) => string;
  /**
   * Scrape-capable platforms whose pricing/availability is gated by delivery
   * location (pincode/lat-long), not just country. When the caller supplies an
   * approximate location, extract requests for these get an explicit IN
   * geography hint (Firecrawl's `location` param) instead of Firecrawl's US
   * default. Note: neither Blinkit nor BigBasket expose a simple URL/cookie
   * param for pincode-level accuracy (both require an interactive location
   * picker) - true dark-store-level precision would need a Firecrawl `actions`
   * (click+type) sequence, which is out of scope for this fix.
   */
  locationAware?: boolean;
  /** Android package-name substrings that identify this platform's app - lets the
   *  screen-text identify flow (which only has a packageName, no URL) know which
   *  marketplace the user is currently viewing, for same-platform guards. */
  packageHints?: string[];
  /**
   * Firecrawl `actions` sequence that sets the delivery pincode before
   * extract, so the scraped price matches what the user would actually pay
   * at their own address instead of the site's default/first-hit price.
   * Only populated where the exact DOM selectors have been verified against
   * the live site (see services/compare.ts liveCompare for where this is
   * invoked) - a platform with no entry here just gets the country-level
   * `location` hint instead (see `locationAware`), never a guessed selector.
   */
  pincodeActions?: (pincode: string) => FirecrawlAction[];
}

const IN_MARKETPLACES: Marketplace[] = [
  {
    id: "amazon_in",
    name: "Amazon",
    domains: ["amazon.in", "amzn.in", "amzn.to"],
    categories: ["general", "electronics", "books"],
    kind: "marketplace",
    packageHints: ["amazon"],
    // Verified live against amazon.in: #nav-global-location-popover-link opens
    // the "Deliver to" modal, #GLUXZipUpdateInput is the pincode field inside
    // it (a long-stable Amazon selector - independently confirmed via public
    // scraping references, not guessed). Enter submits without needing to
    // locate the modal's apply-button selector.
    pincodeActions: (pincode) => [
      { type: "click", selector: "#nav-global-location-popover-link" },
      { type: "wait", milliseconds: 1200 },
      { type: "click", selector: "#GLUXZipUpdateInput" },
      { type: "write", text: pincode },
      { type: "press", key: "Enter" },
      { type: "wait", milliseconds: 1500 },
    ],
  },
  { id: "flipkart", name: "Flipkart", domains: ["flipkart.com", "dl.flipkart.com"], categories: ["general", "electronics"], kind: "marketplace", packageHints: ["flipkart"] },
  { id: "croma", name: "Croma", domains: ["croma.com"], categories: ["electronics"], kind: "marketplace", packageHints: ["croma"] },
  { id: "reliance_digital", name: "Reliance Digital", domains: ["reliancedigital.in"], categories: ["electronics"], kind: "marketplace", packageHints: ["reliancedigital", "reliance.digital"] },
  { id: "vijay_sales", name: "Vijay Sales", domains: ["vijaysales.com"], categories: ["electronics"], kind: "marketplace", packageHints: ["vijaysales"] },
  { id: "myntra", name: "Myntra", domains: ["myntra.com"], categories: ["fashion"], kind: "marketplace", packageHints: ["myntra"] },
  { id: "ajio", name: "AJIO", domains: ["ajio.com"], categories: ["fashion"], kind: "marketplace", packageHints: ["ajio"] },
  { id: "nykaa", name: "Nykaa", domains: ["nykaa.com", "nykaafashion.com"], categories: ["beauty", "fashion"], kind: "marketplace", packageHints: ["nykaa"] },
  { id: "tata_1mg", name: "Tata 1mg", domains: ["1mg.com"], categories: ["pharmacy"], kind: "marketplace", packageHints: ["tata1mg", "1mg"] },
  // Blinkit has a public catalog, but live tests could not bind anonymous page
  // prices to a verified delivery location. Showing those as current offers is
  // worse than omitting them.
  //
  // pincodeActions intentionally NOT set here yet: live verification against
  // blinkit.com found the location-bar trigger
  // (.LocationBar__Container-sc-x8ezho-6) and the search input
  // (input[placeholder="search delivery location"]), but typing a pincode
  // into that box opens an autocomplete dropdown that still needs a click on
  // the matching suggestion to actually apply it - that suggestion-item
  // selector was not verified live, and shipping a guessed one risks leaving
  // the page in a stuck-dropdown state that makes the extract worse, not
  // better. Verify the suggestion selector before adding this.
  {
    id: "blinkit",
    name: "Blinkit",
    domains: ["blinkit.com"],
    categories: ["grocery"],
    kind: "quick_commerce",
    capability: "deeplinkOnly",
    antiBotStealth: true,
    locationAware: true,
    searchUrl: (q) => `https://blinkit.com/s/?q=${encodeURIComponent(q)}`,
    packageHints: ["blinkit", "grofers"],
  },
  // Zepto's web app (zeptonow.com) is a session-gated SPA: pricing comes from a
  // per-session-signed internal API and even full-page render needs a delivery
  // location picked first. A stateless scrape can't reliably get accurate,
  // location-correct prices - deeplink-only avoids surfacing wrong prices.
  {
    id: "zepto",
    name: "Zepto",
    domains: ["zeptonow.com", "zepto.com"],
    categories: ["grocery"],
    kind: "quick_commerce",
    capability: "deeplinkOnly",
    // Confirmed working web search page (Next.js SPA route, no session needed).
    searchUrl: (q) => `https://www.zepto.com/search?query=${encodeURIComponent(q)}`,
    packageHints: ["zepto"],
  },
  // BigBasket pages expose catalog data, but anonymous prices are location
  // dependent and live tests could not verify the delivery pincode.
  {
    id: "bigbasket",
    name: "BigBasket",
    domains: ["bigbasket.com"],
    categories: ["grocery"],
    kind: "quick_commerce",
    capability: "deeplinkOnly",
    locationAware: true,
    searchUrl: (q) => `https://www.bigbasket.com/ps/?q=${encodeURIComponent(q)}`,
    packageHints: ["bigbasket"],
  },
  // Milkbasket is a subscription grocery app with no public web catalog - even
  // browsing requires OTP login. No documented search page either, so the best
  // we can offer is the marketing homepage (deeplink-only, no searchUrl).
  {
    id: "milkbasket",
    name: "Milkbasket",
    domains: ["milkbasket.com"],
    categories: ["grocery"],
    kind: "quick_commerce",
    capability: "deeplinkOnly",
    manualUrl: "https://www.milkbasket.com/",
    packageHints: ["milkbasket"],
  },
  // Flipkart Minutes is currently just a tab inside the main Flipkart app (no
  // standalone app/domain yet as of mid-2026) - no separate catalog to scrape.
  // Falls back to Flipkart's own (documented) search page/deep-link domain.
  {
    id: "flipkart_minutes",
    name: "Flipkart Minutes",
    domains: [],
    categories: ["grocery"],
    kind: "quick_commerce",
    capability: "deeplinkOnly",
    manualUrl: "https://www.flipkart.com/",
    searchUrl: (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`,
  },
  // Swiggy Instamart has no official public API and no scrape-friendly public
  // catalog (session/city gated, historically aggressive anti-bot), but its
  // web search route is real and public - deeplink to that instead of scraping.
  {
    id: "swiggy_instamart",
    name: "Swiggy Instamart",
    domains: ["swiggy.com"],
    categories: ["grocery"],
    kind: "quick_commerce",
    capability: "deeplinkOnly",
    manualUrl: "https://www.swiggy.com/instamart",
    searchUrl: (q) => `https://www.swiggy.com/instamart/search?query=${encodeURIComponent(q)}`,
    packageHints: ["swiggy", "instamart"],
  },
  { id: "meesho", name: "Meesho", domains: ["meesho.com"], categories: ["general", "fashion"], kind: "marketplace", packageHints: ["meesho"] },
  { id: "snapdeal", name: "Snapdeal", domains: ["snapdeal.com"], categories: ["general"], kind: "marketplace", packageHints: ["snapdeal"] },
  { id: "tatacliq", name: "Tata CLiQ", domains: ["tatacliq.com"], categories: ["general", "electronics"], kind: "marketplace" },
  { id: "ikea", name: "IKEA", domains: ["ikea.com"], categories: ["home"], kind: "marketplace" },
  { id: "pepperfry", name: "Pepperfry", domains: ["pepperfry.com"], categories: ["home"], kind: "marketplace" },
  { id: "firstcry", name: "FirstCry", domains: ["firstcry.com"], categories: ["baby"], kind: "marketplace" },
  { id: "headphonezone", name: "Headphone Zone", domains: ["headphonezone.in"], categories: ["electronics"], kind: "marketplace" },
];

const US_MARKETPLACES: Marketplace[] = [
  { id: "amazon_com", name: "Amazon", domains: ["amazon.com", "amzn.to", "a.co"], categories: ["general", "electronics", "books"], kind: "marketplace", packageHints: ["amazon"] },
  { id: "walmart", name: "Walmart", domains: ["walmart.com"], categories: ["general", "electronics", "grocery"], kind: "marketplace", packageHints: ["walmart"] },
  { id: "target", name: "Target", domains: ["target.com"], categories: ["general", "electronics", "home"], kind: "marketplace", packageHints: ["target"] },
  { id: "bestbuy", name: "Best Buy", domains: ["bestbuy.com"], categories: ["electronics"], kind: "marketplace", packageHints: ["bestbuy"] },
  { id: "ebay", name: "eBay", domains: ["ebay.com"], categories: ["general"], kind: "marketplace", packageHints: ["ebay"] },
  { id: "instacart", name: "Instacart", domains: ["instacart.com"], categories: ["grocery"], kind: "quick_commerce", packageHints: ["instacart"] },
  { id: "gopuff", name: "Gopuff", domains: ["gopuff.com"], categories: ["grocery"], kind: "quick_commerce", packageHints: ["gopuff"] },
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

/**
 * Identifies which marketplace's app the user is currently in from an Android
 * package name (e.g. "com.amazon.mShop.android.shopping" -> amazon_in). Used by
 * the screen-text identify flow to know the "current platform" for same-platform
 * deal guards, since that flow only has a packageName, not a URL. Returns null
 * when no marketplace's packageHints match - callers must not guess.
 */
export function marketplaceIdForPackage(packageName: string, country: Country = "IN"): string | null {
  const pkg = packageName.toLowerCase();
  for (const m of marketplacesFor(country)) {
    if (m.packageHints?.some((h) => pkg.includes(h))) return m.id;
  }
  return null;
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

/** True unless explicitly marked deeplinkOnly - default preserves pre-existing scrape behavior. */
export function isScrapeCapable(m: Marketplace): boolean {
  return m.capability !== "deeplinkOnly";
}

export function scrapeMarketplacesFor(country: Country = "IN"): Marketplace[] {
  return marketplacesFor(country).filter(isScrapeCapable);
}

/** Prefer marketplaces that sell this category; keep `general` as catch-all. */
export function scrapeMarketplacesForCategory(
  country: Country,
  category: string | null | undefined
): Marketplace[] {
  const list = scrapeMarketplacesFor(country);
  const cat = (category || "general").toLowerCase();
  const matched = list.filter(
    (m) => (m.categories as string[]).includes(cat) || (m.categories as string[]).includes("general")
  );
  return matched.length ? matched : list;
}

/** Explicit scrape strategy derived from marketplace flags (no guessed selectors). */
export function marketplaceStrategy(m: Marketplace): {
  proxy: "basic" | "enhanced";
  locationSensitive: boolean;
  waitMs: number;
  hasVerifiedPincodeActions: boolean;
} {
  return {
    proxy: m.antiBotStealth ? "enhanced" : "basic",
    locationSensitive: Boolean(m.locationAware),
    waitMs: m.pincodeActions ? 2700 : m.locationAware ? 800 : 0,
    hasVerifiedPincodeActions: Boolean(m.pincodeActions),
  };
}

export function deeplinkOnlyMarketplacesFor(country: Country = "IN"): Marketplace[] {
  return marketplacesFor(country).filter((m) => !isScrapeCapable(m));
}

/**
 * Real destination URL for a deeplinkOnly marketplace's "check manually" offer.
 * Prefers a documented in-app search URL for the product (so the user lands on
 * relevant results, not the bare homepage); falls back to a web search scoped to
 * the platform's domain when no search URL is documented for it; only falls
 * back to the plain homepage when no query is given at all.
 */
export function manualUrlFor(m: Marketplace, query?: string): string {
  if (query && query.trim()) {
    if (m.searchUrl) return m.searchUrl(query.trim());
    if (m.domains[0]) {
      return `https://www.google.com/search?q=${encodeURIComponent(`site:${m.domains[0]} ${query.trim()}`)}`;
    }
  }
  return m.manualUrl ?? (m.domains[0] ? `https://${m.domains[0]}` : "");
}
