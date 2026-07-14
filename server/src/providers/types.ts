import type { SearchResult, ScrapedPage } from "../anakin.js";

export enum ProviderCapability {
  Search = "search",
  Scrape = "scrape",
  ExtractStructured = "extract_structured",
}

export interface StructuredProductData {
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  price?: string | null;
  currency?: string | null;
  gtin?: string | null;
  upc?: string | null;
  ean?: string | null;
  seller?: string | null;
  inStock?: boolean | null;
  imageUrl?: string | null;
  description?: string | null;
}

/** Firecrawl proxy tier - see docs/features/enhanced-mode. "enhanced" costs more but is far
 *  more reliable on sites that block datacenter IPs (e.g. Blinkit). */
export type ScrapeProxyTier = "basic" | "enhanced" | "auto";

/** Firecrawl request geography - routes the scrape through the given country's
 *  proxy and emulates its language/timezone. Firecrawl defaults to "US" when
 *  unset, which is wrong for India-only sites - pass "IN" explicitly for
 *  location-gated Indian marketplaces. */
export interface ScrapeLocation {
  country: string;
  languages?: string[];
}

export interface ResearchProvider {
  readonly name: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
  search(query: string, limit?: number): Promise<SearchResult[]>;
  scrape(url: string): Promise<ScrapedPage | null>;
  scrapeBatch?(urls: string[]): Promise<ScrapedPage[]>;
  extractStructured?(
    url: string,
    opts?: { proxy?: ScrapeProxyTier; location?: ScrapeLocation }
  ): Promise<StructuredProductData | null>;
}

export interface SearchTask {
  type: string;
  prompt: string;
  minResults?: number;
}

export interface OrchestratedSearch {
  type: string;
  results: SearchResult[];
  provider: string;
}
