import {
  synthesizeLongTermScore,
  synthesizeVersionHistory,
  synthesizeScamDetector,
  synthesizeBestInCategory,
} from "./claude.js";
import { CreditTracker, gatherPages, type SourceQuery } from "./webResearch.js";
import type {
  ProductIdentity,
  LongTermScore,
  VersionHistory,
  ScamDetector,
  BestInCategory,
} from "./schema.js";

export type InsightType = "long-term" | "version-history" | "scam-detector" | "best-in-category";

const SEARCH_TIMEOUT_MS = 10000;
const SCRAPE_TIMEOUT_MS = 15000;
const SCRAPE_ONE_TIMEOUT_MS = 10000;
const MAX_URLS = 4;

function queriesFor(type: InsightType, product: ProductIdentity, term: string): SourceQuery[] {
  switch (type) {
    case "long-term":
      return [
        { type: "long_term_reddit", prompt: `site:reddit.com ${term} after 1 year 2 years long term review` },
        { type: "long_term_forum", prompt: `${term} long term ownership review months later update` },
      ];
    case "version-history":
      return [
        { type: "version_compare", prompt: `${term} vs previous generation model what changed comparison` },
        { type: "version_news", prompt: `${term} new version upgrade changes review` },
      ];
    case "scam-detector":
      return [
        { type: "scam_reddit", prompt: `${term} fake reviews scam counterfeit warning reddit` },
        { type: "scam_seller", prompt: `${term} counterfeit knockoff fake seller amazon warning` },
      ];
    case "best-in-category":
      return [
        { type: "best_in_category", prompt: `best ${product.category} ${term} comparison ranking` },
        { type: "competitor", prompt: `${term} vs competitors comparison review which is better` },
      ];
  }
}

async function research(type: InsightType, product: ProductIdentity) {
  const term = product.searchTerm || product.name;
  const tracker = new CreditTracker();
  const pages = await gatherPages(term, queriesFor(type, product, term), tracker, {
    maxUrls: MAX_URLS,
    searchTimeoutMs: SEARCH_TIMEOUT_MS,
    scrapeTimeoutMs: SCRAPE_TIMEOUT_MS,
    scrapeOneTimeoutMs: SCRAPE_ONE_TIMEOUT_MS,
  });
  return pages;
}

export async function getLongTermScore(product: ProductIdentity): Promise<LongTermScore> {
  const pages = await research("long-term", product);
  return synthesizeLongTermScore(product, pages);
}

export async function getVersionHistory(product: ProductIdentity): Promise<VersionHistory> {
  const pages = await research("version-history", product);
  return synthesizeVersionHistory(product, pages);
}

export async function getScamDetector(product: ProductIdentity): Promise<ScamDetector> {
  const pages = await research("scam-detector", product);
  return synthesizeScamDetector(product, pages);
}

export async function getBestInCategory(product: ProductIdentity): Promise<BestInCategory> {
  const pages = await research("best-in-category", product);
  return synthesizeBestInCategory(product, pages);
}
