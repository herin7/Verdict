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

export interface ResearchProvider {
  readonly name: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
  search(query: string, limit?: number): Promise<SearchResult[]>;
  scrape(url: string): Promise<ScrapedPage | null>;
  scrapeBatch?(urls: string[]): Promise<ScrapedPage[]>;
  extractStructured?(url: string): Promise<StructuredProductData | null>;
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
