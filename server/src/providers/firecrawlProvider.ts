import {
  firecrawlEnabled,
  firecrawlSearch,
  firecrawlScrape,
  firecrawlExtract,
} from "../firecrawl.js";
import type { SearchResult, ScrapedPage } from "../anakin.js";
import { ProviderCapability, type ResearchProvider, type StructuredProductData } from "./types.js";

export const firecrawlProvider: ResearchProvider = {
  name: "firecrawl",
  capabilities: new Set([
    ProviderCapability.Search,
    ProviderCapability.Scrape,
    ProviderCapability.ExtractStructured,
  ]),

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    if (!firecrawlEnabled()) return [];
    return firecrawlSearch(query, limit);
  },

  async scrape(url: string): Promise<ScrapedPage | null> {
    if (!firecrawlEnabled()) return null;
    return firecrawlScrape(url);
  },

  async extractStructured(url: string): Promise<StructuredProductData | null> {
    if (!firecrawlEnabled()) return null;
    return firecrawlExtract(url);
  },
};
