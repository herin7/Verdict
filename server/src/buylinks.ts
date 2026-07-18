import { firecrawlEnabled, firecrawlSearch, firecrawlScrapeHtml } from "./firecrawl.js";
import type { SearchResult } from "./providers/types.js";
import { withTimeout } from "./webResearch.js";
import { allMarketplaceDomains, type Country } from "./marketplaces/registry.js";

export interface BuyLink {
  retailer: string;
  url: string;
  title: string;
  price: string | null;
}

// Matches the common currency-prefixed price formats that show up in retail
// search snippets, e.g. "$199.99", "₹15,999", "Rs. 4,499", "£49.99".
const PRICE_TEXT_RE = /(?:₹|Rs\.?\s?|INR\s?|\$|USD\s?|£|GBP\s?|€|EUR\s?)\s?[\d,]+(?:\.\d{1,2})?/i;

/**
 * True when a scraped price string's currency symbol matches the user's own
 * country currency, OR carries no symbol at all (ambiguous - permissive by
 * default since most bare numbers here are already same-country context).
 * A price with an explicit, DIFFERENT symbol is never shown (mirrors the
 * "hide mismatches" rule in marketplaces/normalize.ts filterOffersByCurrency)
 * - relabeling the symbol would show a wrong price, not just a wrong symbol.
 */
function matchesCountryCurrency(raw: string | null, country: Country): boolean {
  if (!raw) return true;
  const isUsdSymbol = /\$|USD/i.test(raw);
  const isInrSymbol = /₹|Rs\.?\s|INR/i.test(raw);
  if (!isUsdSymbol && !isInrSymbol) return true;
  return country === "US" ? isUsdSymbol : isInrSymbol;
}

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
  if (!firecrawlEnabled()) return null;
  try {
    const html = await withTimeout(firecrawlScrapeHtml(url), 9000, null);
    return html ? extractPriceFromHtml(html) : null;
  } catch {
    // best effort - leave price null
    return null;
  }
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Country-scoped so a US search result (walmart.com/bestbuy.com/...) never
 *  surfaces as a "buy link" for an IN user (and vice versa) - the prior flat,
 *  country-blind domain list was itself a source of wrong-currency buy links. */
function isRetailUrl(url: string, country: Country): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  return allMarketplaceDomains(country).some((d) => host === d || host.endsWith(`.${d}`));
}

function retailerName(url: string): string {
  const host = hostnameOf(url);
  if (!host) return "Store";
  const parts = host.split(".");
  const name = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Filters real search citations down to known retail/marketplace domains for
 * the user's own country (never invented), then fills in a per-platform price
 * - free from the search snippet when mentioned there, otherwise a bounded
 * live scrape (max 3, so a price comparison never costs more than a few
 * extra credits). Any resolved price whose currency symbol doesn't match the
 * user's country is dropped (never relabeled - see matchesCountryCurrency).
 */
export async function extractBuyLinks(
  grouped: { results: SearchResult[] }[],
  country: Country,
  max = 4
): Promise<BuyLink[]> {
  const seenDomain = new Set<string>();
  const links: BuyLink[] = [];
  for (const g of grouped) {
    for (const r of g.results) {
      if (!isRetailUrl(r.url, country)) continue;
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

  for (const link of links) {
    if (!matchesCountryCurrency(link.price, country)) link.price = null;
  }

  return links;
}

/** On-demand buy-link + price lookup for a single term (e.g. an alternative product name). */
export async function findBuyLinks(term: string, country: Country, max = 4): Promise<BuyLink[]> {
  const sites = allMarketplaceDomains(country)
    .slice(0, 6)
    .map((d) => `site:${d}`)
    .join(" OR ");
  const prompt = `${term} buy price ${sites}`;

  let results: SearchResult[] = [];
  if (firecrawlEnabled()) {
    try {
      results = await firecrawlSearch(prompt, 8);
    } catch (err) {
      console.warn(`[buylinks] firecrawl search failed: ${(err as Error).message}`);
    }
  }

  return extractBuyLinks([{ results }], country, max);
}
