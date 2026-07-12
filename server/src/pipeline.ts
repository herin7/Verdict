import type { ScrapedPage } from "./anakin.js";
import { firecrawlEnabled } from "./firecrawl.js";
import { synthesizeReport } from "./claude.js";
import { extractBuyLinks, type BuyLink } from "./buylinks.js";
import { CreditTracker, scrapeWithFallback, searchMany, selectUrls, type SourceQuery } from "./webResearch.js";
import type { ConsensusReport, ProductIdentity } from "./schema.js";

export interface ResearchResult {
  report: ConsensusReport;
  buyLinks: BuyLink[];
}

const SEARCH_TIMEOUT_MS = 12000;
const SCRAPE_TIMEOUT_MS = 22000;
const SCRAPE_ONE_TIMEOUT_MS = 12000;
const MAX_URLS_TO_SCRAPE = 6;

/**
 * Source-scoped queries. Each costs 3 credits, so the set is kept lean while
 * still spanning the platforms that drive purchase consensus.
 */
function buildQueries(term: string): SourceQuery[] {
  return [
    { type: "reddit", prompt: `site:reddit.com ${term} long term review problems worth it` },
    { type: "retail", prompt: `${term} customer reviews rating amazon flipkart` },
    { type: "youtube", prompt: `site:youtube.com ${term} review after months` },
    { type: "blog_forum", prompt: `${term} common problems reliability owners complaints forum` },
    { type: "news", prompt: `${term} review verdict should you buy` },
    { type: "price", prompt: `${term} price history discount best time to buy deal` },
  ];
}

export async function runResearch(product: ProductIdentity): Promise<ResearchResult> {
  const term = product.searchTerm || product.name;
  const queries = buildQueries(term);
  const tracker = new CreditTracker();

  // A single failing search must not discard the credits already spent on the
  // others - searchMany catches per query so partial results still produce a report.
  const grouped = await searchMany(queries, tracker, { limit: 5, timeoutMs: SEARCH_TIMEOUT_MS });

  const picked = selectUrls(grouped, MAX_URLS_TO_SCRAPE);

  // Nothing to ground the report on. Fail loudly instead of paying Claude to
  // hallucinate from an empty corpus.
  if (picked.length === 0) {
    if (tracker.error && !firecrawlEnabled()) throw tracker.error;
    throw new Error(
      `No sources found for "${term}". Both Anakin and the Firecrawl fallback returned no usable citations.`
    );
  }

  const byUrl = await scrapeWithFallback(
    picked.map((p) => p.url),
    tracker,
    { batchTimeoutMs: SCRAPE_TIMEOUT_MS, oneTimeoutMs: SCRAPE_ONE_TIMEOUT_MS }
  );

  // Last resort: use the search snippet so Claude always has some grounding per
  // citation, never a blank source.
  const pages: ScrapedPage[] = picked.map((p) => byUrl.get(p.url) ?? { url: p.url, markdown: p.title });

  // Real citations filtered to known retail domains - price comes free from the
  // snippet when mentioned, else a small bounded scrape (never invented by the LLM).
  const buyLinksPromise = extractBuyLinks(grouped);

  const report = await synthesizeReport(product, pages);
  const buyLinks = await buyLinksPromise;
  return { report, buyLinks };
}
