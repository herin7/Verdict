import { firecrawlEnabled, firecrawlSearch, firecrawlScrapeHtml } from "./firecrawl.js";
import type { SearchResult } from "./providers/types.js";
import { withTimeout } from "./webResearch.js";
import { allMarketplaceDomains, findMarketplace, type Country } from "./marketplaces/registry.js";
import { buildPriceCandidate, payableFromEvidence } from "./marketplaces/normalize.js";

export interface BuyLink {
  retailer: string;
  retailerId: string;
  url: string;
  title: string;
  amount: number | null;
  currency: string | null;
}

const PRICE_META_RE = [
  /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i,
  /<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']price["']/i,
];
const PRICE_CURRENCY_META_RE =
  /<meta[^>]+(?:property|name)=["'](?:product:price:currency|og:price:currency)["'][^>]+content=["']([^"']+)["']/i;

function validateSnippetPrice(
  text: string,
  country: Country
): { amount: number; currency: string } | null {
  const defaultCurrency = country === "US" ? "USD" : "INR";
  const candidate = buildPriceCandidate({
    raw: text.match(/(?:₹|Rs\.?\s*|INR\b|\$|USD\b)\s*[\d,.]+|[\d,.]+\s*(?:₹|Rs\.?|INR\b|\$|USD\b)/i)?.[0] ?? text,
    context: text,
    source: "search_snippet",
    declaredCurrency: defaultCurrency,
    defaultCurrency,
    allowBareNumeric: false,
  });
  const payable = payableFromEvidence(candidate);
  if (!payable) return null;
  if (country === "US" && payable.currency !== "USD") return null;
  if (country !== "US" && payable.currency !== "INR") return null;
  return payable;
}

function extractPriceFromHtml(html: string, country: Country): { amount: number; currency: string } | null {
  for (const re of PRICE_META_RE) {
    const m = re.exec(html);
    if (m?.[1]) {
      const currency = PRICE_CURRENCY_META_RE.exec(html)?.[1] ?? (country === "US" ? "USD" : "INR");
      const candidate = buildPriceCandidate({
        raw: m[1],
        context: `meta price ${m[1]} ${currency}`,
        source: "meta",
        fieldPath: "og:price:amount",
        declaredCurrency: currency,
        defaultCurrency: country === "US" ? "USD" : "INR",
        allowBareNumeric: true,
      });
      return payableFromEvidence(candidate);
    }
  }
  return null;
}

async function scrapePriceForLink(
  url: string,
  country: Country
): Promise<{ amount: number; currency: string } | null> {
  if (!firecrawlEnabled()) return null;
  try {
    const html = await withTimeout(firecrawlScrapeHtml(url), 9000, null);
    return html ? extractPriceFromHtml(html, country) : null;
  } catch {
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

function isRetailUrl(url: string, country: Country): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  return allMarketplaceDomains(country).some((d) => host === d || host.endsWith(`.${d}`));
}

function retailerName(url: string): string {
  const host = hostnameOf(url);
  if (!host) return "Store";
  const parts = host.split(".");
  const name = parts.length > 2 ? parts[parts.length - 2]! : parts[0]!;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function retailerIdFor(url: string): string {
  return findMarketplace(url)?.id ?? hostnameOf(url)?.replace(/\./g, "_") ?? "store";
}

/** Sanitize cached / legacy buy links: drop string-only prices, rebuild evidence. */
export function sanitizeBuyLinks(raw: unknown, country: Country = "IN"): BuyLink[] {
  if (!Array.isArray(raw)) return [];
  const out: BuyLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.url !== "string" || !row.url) continue;
    const title = typeof row.title === "string" ? row.title : retailerName(row.url);
    const retailer = typeof row.retailer === "string" ? row.retailer : retailerName(row.url);
    const retailerId =
      typeof row.retailerId === "string" && row.retailerId
        ? row.retailerId
        : retailerIdFor(row.url);

    let amount: number | null = null;
    let currency: string | null = null;

    if (typeof row.amount === "number" && row.amount > 0 && typeof row.currency === "string") {
      const cand = buildPriceCandidate({
        raw: row.amount,
        context: typeof row.price === "string" ? row.price : String(row.amount),
        source: "search_snippet",
        fieldPath: "amount",
        declaredCurrency: row.currency,
        defaultCurrency: country === "US" ? "USD" : "INR",
        allowBareNumeric: true,
      });
      const pay = payableFromEvidence(cand);
      if (pay && pay.currency === row.currency) {
        amount = pay.amount;
        currency = pay.currency;
      }
    } else if (typeof row.price === "string") {
      const pay = validateSnippetPrice(row.price, country);
      if (pay) {
        amount = pay.amount;
        currency = pay.currency;
      }
    }

    out.push({ retailer, retailerId, url: row.url, title, amount, currency });
  }
  return out;
}

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
      const snippetPrice = validateSnippetPrice(`${r.title} ${r.snippet}`, country);
      links.push({
        retailer: retailerName(r.url),
        retailerId: retailerIdFor(r.url),
        url: r.url,
        title: r.title || retailerName(r.url),
        amount: snippetPrice?.amount ?? null,
        currency: snippetPrice?.currency ?? null,
      });
      if (links.length >= max) break;
    }
    if (links.length >= max) break;
  }

  const needScrape = links.filter((l) => l.amount == null).slice(0, 3);
  await Promise.all(
    needScrape.map(async (link) => {
      const scraped = await scrapePriceForLink(link.url, country);
      if (scraped) {
        link.amount = scraped.amount;
        link.currency = scraped.currency;
      }
    })
  );

  return links;
}

export async function findBuyLinks(term: string, country: Country, max = 4): Promise<BuyLink[]> {
  if (!firecrawlEnabled()) return [];
  const results = await firecrawlSearch(term, Math.max(max * 3, 8));
  return extractBuyLinks([{ results }], country, max);
}
