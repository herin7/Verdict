import {
  search,
  scrape,
  scrapeBatch,
  type SearchResult,
  type ScrapedPage,
} from "../anakin.js";
import { ProviderCapability, type ResearchProvider, type StructuredProductData } from "./types.js";

export const anakinProvider: ResearchProvider = {
  name: "anakin",
  capabilities: new Set([ProviderCapability.Search, ProviderCapability.Scrape]),

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    return search(query, limit);
  },

  async scrape(url: string): Promise<ScrapedPage | null> {
    return scrape(url);
  },

  async scrapeBatch(urls: string[]): Promise<ScrapedPage[]> {
    return scrapeBatch(urls);
  },

  async extractStructured(): Promise<StructuredProductData | null> {
    return null;
  },
};
