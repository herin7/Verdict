import {
  firecrawlEnabled,
  firecrawlSearch,
  firecrawlScrape,
  firecrawlExtract,
  type FirecrawlAction,
} from "../firecrawl.js";
import {
  ProviderCapability,
  type ResearchProvider,
  type ScrapedPage,
  type SearchResult,
  type StructuredProductData,
} from "./types.js";

export const firecrawlProvider: ResearchProvider = {
  name: "firecrawl",
  capabilities: new Set([
    ProviderCapability.Search,
    ProviderCapability.Scrape,
    ProviderCapability.ExtractStructured,
  ]),

  async search(query: string, limit = 5, signal?: AbortSignal): Promise<SearchResult[]> {
    if (!firecrawlEnabled()) return [];
    return firecrawlSearch(query, limit, signal);
  },

  async scrape(url: string, signal?: AbortSignal): Promise<ScrapedPage | null> {
    if (!firecrawlEnabled()) return null;
    return firecrawlScrape(url, signal);
  },

  async extractStructured(
    url: string,
    opts?: {
      proxy?: "basic" | "enhanced" | "auto";
      location?: { country: string; languages?: string[] };
      actions?: FirecrawlAction[];
    },
    signal?: AbortSignal
  ): Promise<StructuredProductData | null> {
    if (!firecrawlEnabled()) return null;
    return firecrawlExtract(url, opts, signal);
  },
};
