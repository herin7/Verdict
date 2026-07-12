import type { SearchResult, ScrapedPage } from "./anakin.js";
import {
  CreditTracker,
  orchestratedSearch,
  orchestratedSearchMany,
  orchestratedScrape,
} from "./providers/orchestrator.js";

export { CreditTracker };
export type { SearchResult, ScrapedPage };

export interface SourceQuery {
  type: string;
  prompt: string;
}

export interface GroupedResults {
  type: string;
  results: SearchResult[];
}

export async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Anakin-first search via orchestrator; Firecrawl fills gaps only. */
export async function searchWithFallback(
  q: SourceQuery,
  tracker: CreditTracker,
  limit = 5,
  timeoutMs = 12000
): Promise<SearchResult[]> {
  const out = await orchestratedSearch(
    { type: q.type, prompt: q.prompt, minResults: 1 },
    tracker,
    { limit, timeoutMs }
  );
  return out.results;
}

export async function searchMany(
  queries: SourceQuery[],
  tracker: CreditTracker,
  opts: { limit?: number; timeoutMs?: number } = {}
): Promise<GroupedResults[]> {
  const results = await orchestratedSearchMany(
    queries.map((q) => ({ type: q.type, prompt: q.prompt })),
    tracker,
    opts
  );
  return results.map((r) => ({ type: r.type, results: r.results }));
}

export async function scrapeWithFallback(
  urls: string[],
  tracker: CreditTracker,
  opts: { batchTimeoutMs?: number; oneTimeoutMs?: number } = {}
): Promise<Map<string, ScrapedPage>> {
  return orchestratedScrape(urls, tracker, opts);
}

/** Rank + dedupe citations across query groups: prefer source-type diversity, cap total. */
export function selectUrls(
  grouped: GroupedResults[],
  max: number
): { url: string; type: string; title: string }[] {
  const seen = new Set<string>();
  const picked: { url: string; type: string; title: string }[] = [];
  let round = 0;
  const maxRound = Math.max(...grouped.map((g) => g.results.length), 0);
  while (picked.length < max && round < maxRound) {
    for (const g of grouped) {
      const r = g.results[round];
      if (!r?.url) continue;
      let key: string;
      try {
        const u = new URL(r.url);
        key = hostname(r.url) + u.pathname;
      } catch {
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push({ url: r.url, type: g.type, title: r.title });
      if (picked.length >= max) break;
    }
    round++;
  }
  return picked;
}

/** Search + scrape a lean set of queries down to grounded pages, orchestrator-backed. */
export async function gatherPages(
  term: string,
  queries: SourceQuery[],
  tracker: CreditTracker,
  opts: {
    maxUrls?: number;
    searchTimeoutMs?: number;
    scrapeTimeoutMs?: number;
    scrapeOneTimeoutMs?: number;
  } = {}
): Promise<ScrapedPage[]> {
  const grouped = await searchMany(queries, tracker, {
    limit: 5,
    timeoutMs: opts.searchTimeoutMs ?? 10000,
  });
  const picked = selectUrls(grouped, opts.maxUrls ?? 4);

  if (picked.length === 0) {
    if (tracker.error) throw tracker.error;
    throw new Error(`No sources found for "${term}".`);
  }

  const byUrl = await scrapeWithFallback(
    picked.map((p) => p.url),
    tracker,
    {
      batchTimeoutMs: opts.scrapeTimeoutMs ?? 15000,
      oneTimeoutMs: opts.scrapeOneTimeoutMs ?? 10000,
    }
  );

  return picked.map((p) => byUrl.get(p.url) ?? { url: p.url, markdown: p.title });
}
