import type { FirecrawlAction } from "../firecrawl.js";

export enum ProviderCapability {
  Search = "search",
  Scrape = "scrape",
  ExtractStructured = "extract_structured",
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  date?: string;
  last_updated?: string;
}

export interface ScrapedPage {
  url: string;
  markdown: string;
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
  /**
   * `signal` aborts the underlying HTTP call when the orchestrator's own
   * timeout race fires - without it, a "timed out" call keeps running in the
   * background (still retrying, still holding a connection) well past the
   * point the orchestrator already gave up and moved on. Optional only so
   * providers that don't wire it through yet still satisfy the interface.
   */
  search(query: string, limit?: number, signal?: AbortSignal): Promise<SearchResult[]>;
  scrape(url: string, signal?: AbortSignal): Promise<ScrapedPage | null>;
  scrapeBatch?(urls: string[], signal?: AbortSignal): Promise<ScrapedPage[]>;
  extractStructured?(
    url: string,
    opts?: { proxy?: ScrapeProxyTier; location?: ScrapeLocation; actions?: FirecrawlAction[] },
    signal?: AbortSignal
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
