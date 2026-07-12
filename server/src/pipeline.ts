import { search, scrapeBatch, type SearchResult, type ScrapedPage } from "./anakin.js";
import { synthesizeReport } from "./claude.js";
import type { ConsensusReport, ProductIdentity } from "./schema.js";

const SEARCH_TIMEOUT_MS = 9000;
const SCRAPE_TIMEOUT_MS = 15000;
const MAX_URLS_TO_SCRAPE = 8;

interface SourceQuery {
  type: string;
  prompt: string;
}

function buildQueries(term: string): SourceQuery[] {
  return [
    { type: "reddit", prompt: `site:reddit.com ${term} long term review problems worth it` },
    { type: "amazon", prompt: `site:amazon.com OR site:amazon.in ${term} customer reviews rating` },
    { type: "flipkart", prompt: `site:flipkart.com ${term} customer reviews rating` },
    { type: "youtube", prompt: `site:youtube.com ${term} review after months` },
    { type: "blog_forum", prompt: `${term} common problems reliability owners complaints forum blog` },
    { type: "news", prompt: `${term} review verdict should you buy` },
    { type: "official", prompt: `${term} official specifications features manufacturer page` },
    { type: "price", prompt: `${term} price history discount best time to buy deal` },
  ];
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Rank + dedupe citations: prefer source-type diversity, cap total. */
function selectUrls(
  grouped: { type: string; results: SearchResult[] }[]
): { url: string; type: string; title: string }[] {
  const seen = new Set<string>();
  const picked: { url: string; type: string; title: string }[] = [];
  let round = 0;
  const maxRound = Math.max(...grouped.map((g) => g.results.length), 0);
  while (picked.length < MAX_URLS_TO_SCRAPE && round < maxRound) {
    for (const g of grouped) {
      const r = g.results[round];
      if (!r?.url) continue;
      const key = hostname(r.url) + new URL(r.url, "https://x").pathname;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push({ url: r.url, type: g.type, title: r.title });
      if (picked.length >= MAX_URLS_TO_SCRAPE) break;
    }
    round++;
  }
  return picked;
}

export async function runResearch(product: ProductIdentity): Promise<ConsensusReport> {
  const term = product.searchTerm || product.name;
  const queries = buildQueries(term);

  const grouped = await Promise.all(
    queries.map(async (q) => ({
      type: q.type,
      results: await withTimeout(search(q.prompt, 5), SEARCH_TIMEOUT_MS, [] as SearchResult[]),
    }))
  );

  const picked = selectUrls(grouped);
  const scraped = await scrapeBatch(picked.map((p) => p.url), { timeoutMs: SCRAPE_TIMEOUT_MS }).catch(
    () => [] as ScrapedPage[]
  );

  // Anakin scrapes some sources but not others in time (or a scrape fails) - fall back to the
  // search snippet for those so Claude always has some grounding, never a blank source.
  const scrapedByUrl = new Map(scraped.map((p) => [p.url, p]));
  const pages: ScrapedPage[] = picked.map((p) => scrapedByUrl.get(p.url) ?? { url: p.url, markdown: p.title });

  return synthesizeReport(product, pages);
}
