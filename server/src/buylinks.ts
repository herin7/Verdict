import { search, type SearchResult } from "./anakin.js";
import { firecrawlEnabled, firecrawlSearch } from "./firecrawl.js";

export interface BuyLink {
  retailer: string;
  url: string;
  title: string;
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

/** Filters real search citations down to known retail/marketplace domains - never invented. */
export function extractBuyLinks(
  grouped: { results: SearchResult[] }[],
  max = 4
): BuyLink[] {
  const seenDomain = new Set<string>();
  const links: BuyLink[] = [];
  for (const g of grouped) {
    for (const r of g.results) {
      if (!isRetailUrl(r.url)) continue;
      const host = hostnameOf(r.url);
      if (!host || seenDomain.has(host)) continue;
      seenDomain.add(host);
      links.push({ retailer: retailerName(r.url), url: r.url, title: r.title || retailerName(r.url) });
      if (links.length >= max) return links;
    }
  }
  return links;
}

/**
 * On-demand buy-link lookup for a single term (e.g. an alternative product name).
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
