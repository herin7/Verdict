import { search, scrapeHtml, type SearchResult } from "./anakin.js";
import { firecrawlEnabled, firecrawlSearch, firecrawlScrapeHtml } from "./firecrawl.js";
import { withTimeout } from "./webResearch.js";

export interface BuyLink {
  retailer: string;
  url: string;
  title: string;
  price: string | null;
}

const RETAIL_DOMAINS = [
  "amazon.",
  "flipkart.",
  "walmart.",
  "bestbuy.",
  "target.",
  "ebay.",
  "croma.",
  "reliancedigital.",
  "myntra.",
  "ajio.",
  "snapdeal.",
  "newegg.",
  "currys.",
  "argos.",
  "noon.",
  "aliexpress.",
];

// Matches the common currency-prefixed price formats that show up in retail
// search snippets, e.g. "$199.99", "₹15,999", "Rs. 4,499", "£49.99".
const PRICE_TEXT_RE = /(?:₹|Rs\.?\s?|INR\s?|\$|USD\s?|£|GBP\s?|€|EUR\s?)\s?[\d,]+(?:\.\d{1,2})?/i;

const PRICE_META_RE = [
  /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i,
  /<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']price["']/i,
];
const PRICE_CURRENCY_META_RE =
  /<meta[^>]+(?:property|name)=["'](?:product:price:currency|og:price:currency)["'][^>]+content=["']([^"']+)["']/i;

function extractPriceFromText(text: string): string | null {
  const m = PRICE_TEXT_RE.exec(text);
  return m ? m[0].trim().replace(/\s+/g, " ") : null;
}

function extractPriceFromHtml(html: string): string | null {
  for (const re of PRICE_META_RE) {
    const m = re.exec(html);
    if (m?.[1]) {
      const currency = PRICE_CURRENCY_META_RE.exec(html)?.[1];
      return currency ? `${currency} ${m[1]}` : m[1];
    }
  }
  return null;
}

/** Best-effort per-URL price scrape (og:price/product:price meta) - never throws, bounded by caller. */
async function scrapePriceForLink(url: string): Promise<string | null> {
  try {
    const html = await withTimeout(scrapeHtml(url), 9000, null);
    const price = html ? extractPriceFromHtml(html) : null;
    if (price) return price;
  } catch {
    // best effort - fall through to firecrawl
  }
  if (firecrawlEnabled()) {
    try {
      const html = await withTimeout(firecrawlScrapeHtml(url), 9000, null);
      if (html) return extractPriceFromHtml(html);
    } catch {
      // best effort - leave price null
    }
  }
  return null;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isRetailUrl(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  return RETAIL_DOMAINS.some((d) => host.includes(d));
}

function retailerName(url: string): string {
  const host = hostnameOf(url);
  if (!host) return "Store";
  const parts = host.split(".");
  const name = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Filters real search citations down to known retail/marketplace domains (never
 * invented), then fills in a per-platform price - free from the search snippet
 * when mentioned there, otherwise a bounded live scrape (max 3, so a price
 * comparison never costs more than a few extra credits).
 */
export async function extractBuyLinks(
  grouped: { results: SearchResult[] }[],
  max = 4
): Promise<BuyLink[]> {
  const seenDomain = new Set<string>();
  const links: BuyLink[] = [];
  for (const g of grouped) {
    for (const r of g.results) {
      if (!isRetailUrl(r.url)) continue;
      const host = hostnameOf(r.url);
      if (!host || seenDomain.has(host)) continue;
      seenDomain.add(host);
      links.push({
        retailer: retailerName(r.url),
        url: r.url,
        title: r.title || retailerName(r.url),
        price: extractPriceFromText(`${r.title} ${r.snippet}`),
      });
      if (links.length >= max) break;
    }
    if (links.length >= max) break;
  }

  const missing = links.filter((l) => !l.price).slice(0, 3);
  if (missing.length > 0) {
    const filled = await Promise.allSettled(missing.map((l) => scrapePriceForLink(l.url)));
    filled.forEach((res, i) => {
      if (res.status === "fulfilled" && res.value) missing[i].price = res.value;
    });
  }

  return links;
}

/**
 * On-demand buy-link + price lookup for a single term (e.g. an alternative product name).
 * Anakin first, Firecrawl fallback - same precedence as the main research pipeline.
 */
export async function findBuyLinks(term: string, max = 4): Promise<BuyLink[]> {
  const prompt = `${term} buy price site:amazon.com OR site:flipkart.com OR site:walmart.com OR site:bestbuy.com OR site:ebay.com`;

  let results: SearchResult[] = [];
  try {
    results = await search(prompt, 8);
  } catch (err) {
    // Anakin first, Firecrawl fallback for any failure - including out of credits.
    console.warn(`[buylinks] anakin search failed: ${(err as Error).message}`);
  }

  if (results.length === 0 && firecrawlEnabled()) {
    try {
      results = await firecrawlSearch(prompt, 8);
    } catch (err) {
      console.warn(`[buylinks] firecrawl search failed: ${(err as Error).message}`);
    }
  }

  return extractBuyLinks([{ results }], max);
}
