import { search, scrapeBatch, AnakinCreditError, type SearchResult, type ScrapedPage } from "./anakin.js";
import { firecrawlEnabled, firecrawlSearch, firecrawlScrape } from "./firecrawl.js";

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

/** Remembers the last Anakin credit error seen across a batch of fallback-aware calls. */
export class CreditTracker {
  error: AnakinCreditError | null = null;
  note(err: unknown) {
    if (err instanceof AnakinCreditError) this.error = err;
  }
}

/** Anakin search first, Firecrawl fallback on failure or empty result - same precedence everywhere. */
export async function searchWithFallback(
  q: SourceQuery,
  tracker: CreditTracker,
  limit = 5,
  timeoutMs = 12000
): Promise<SearchResult[]> {
  async function run(): Promise<SearchResult[]> {
    try {
      const anakin = await search(q.prompt, limit);
      if (anakin.length > 0) return anakin;
    } catch (err) {
      tracker.note(err);
      if (!(err instanceof AnakinCreditError)) {
        console.warn(`[research] anakin search "${q.type}" failed: ${(err as Error).message}`);
      }
    }
    if (firecrawlEnabled()) {
      try {
        return await firecrawlSearch(q.prompt, limit);
      } catch (err) {
        console.warn(`[research] firecrawl search "${q.type}" failed: ${(err as Error).message}`);
      }
    }
    return [];
  }
  return withTimeout(run(), timeoutMs, [] as SearchResult[]);
}

/** Runs all queries in parallel; one failing query never discards the others' credits/results. */
export async function searchMany(
  queries: SourceQuery[],
  tracker: CreditTracker,
  opts: { limit?: number; timeoutMs?: number } = {}
): Promise<GroupedResults[]> {
  return Promise.all(
    queries.map(async (q) => ({
      type: q.type,
      results: await searchWithFallback(q, tracker, opts.limit ?? 5, opts.timeoutMs ?? 12000),
    }))
  );
}

/** Anakin batch scrape first, Firecrawl fills whatever Anakin missed. */
export async function scrapeWithFallback(
  urls: string[],
  tracker: CreditTracker,
  opts: { batchTimeoutMs?: number; oneTimeoutMs?: number } = {}
): Promise<Map<string, ScrapedPage>> {
  const scraped = await scrapeBatch(urls, { timeoutMs: opts.batchTimeoutMs ?? 22000 }).catch((err) => {
    tracker.note(err);
    if (!(err instanceof AnakinCreditError)) {
      console.warn(`[research] anakin batch scrape failed: ${(err as Error).message}`);
    }
    return [] as ScrapedPage[];
  });

  const byUrl = new Map(scraped.map((p) => [p.url, p]));
  const missing = urls.filter((u) => !byUrl.has(u));
  if (missing.length > 0 && firecrawlEnabled()) {
    const filled = await Promise.allSettled(
      missing.map((u) => withTimeout(firecrawlScrape(u), opts.oneTimeoutMs ?? 12000, null))
    );
    filled.forEach((res, i) => {
      if (res.status === "fulfilled" && res.value) byUrl.set(missing[i], res.value);
    });
  }
  return byUrl;
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

/** Search + scrape a lean set of queries down to grounded pages, fallback-aware end to end. */
export async function gatherPages(
  term: string,
  queries: SourceQuery[],
  tracker: CreditTracker,
  opts: { maxUrls?: number; searchTimeoutMs?: number; scrapeTimeoutMs?: number; scrapeOneTimeoutMs?: number } = {}
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
    { batchTimeoutMs: opts.scrapeTimeoutMs ?? 15000, oneTimeoutMs: opts.scrapeOneTimeoutMs ?? 10000 }
  );

  return picked.map((p) => byUrl.get(p.url) ?? { url: p.url, markdown: p.title });
}
