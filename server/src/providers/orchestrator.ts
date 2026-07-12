import { AnakinCreditError, type SearchResult, type ScrapedPage } from "../anakin.js";
import { firecrawlEnabled } from "../firecrawl.js";
import { anakinProvider } from "./anakinProvider.js";
import { firecrawlProvider } from "./firecrawlProvider.js";
import type {
  OrchestratedSearch,
  ResearchProvider,
  SearchTask,
  StructuredProductData,
} from "./types.js";

export class CreditTracker {
  error: AnakinCreditError | null = null;
  note(err: unknown) {
    if (err instanceof AnakinCreditError) this.error = err;
  }
}

const DEFAULT_PROVIDERS: ResearchProvider[] = [anakinProvider, firecrawlProvider];

function primary(): ResearchProvider {
  return DEFAULT_PROVIDERS[0];
}

function secondary(): ResearchProvider | undefined {
  return firecrawlEnabled() ? DEFAULT_PROVIDERS[1] : undefined;
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/**
 * Anakin-first search. Firecrawl fills only when Anakin returns below minResults
 * or throws (non-credit errors still attempt fallback; credit errors are tracked).
 */
export async function orchestratedSearch(
  task: SearchTask,
  tracker: CreditTracker,
  opts: { limit?: number; timeoutMs?: number } = {}
): Promise<OrchestratedSearch> {
  const limit = opts.limit ?? 5;
  const timeoutMs = opts.timeoutMs ?? 12000;
  const min = task.minResults ?? 1;
  const first = primary();
  const second = secondary();

  try {
    const results = await withTimeout(first.search(task.prompt, limit), timeoutMs, [] as SearchResult[]);
    if (results.length >= min) {
      return { type: task.type, results, provider: first.name };
    }
  } catch (err) {
    tracker.note(err);
    if (!(err instanceof AnakinCreditError)) {
      console.warn(`[orch] ${first.name} search "${task.type}" failed: ${(err as Error).message}`);
    }
  }

  if (second) {
    try {
      const results = await withTimeout(second.search(task.prompt, limit), timeoutMs, [] as SearchResult[]);
      return { type: task.type, results, provider: second.name };
    } catch (err) {
      console.warn(`[orch] ${second.name} search "${task.type}" failed: ${(err as Error).message}`);
    }
  }

  return { type: task.type, results: [], provider: first.name };
}

export async function orchestratedSearchMany(
  tasks: SearchTask[],
  tracker: CreditTracker,
  opts: { limit?: number; timeoutMs?: number } = {}
): Promise<OrchestratedSearch[]> {
  return Promise.all(tasks.map((t) => orchestratedSearch(t, tracker, opts)));
}

/**
 * Anakin batch scrape first; Firecrawl fills missed/failed URLs only.
 */
export async function orchestratedScrape(
  urls: string[],
  tracker: CreditTracker,
  opts: { batchTimeoutMs?: number; oneTimeoutMs?: number } = {}
): Promise<Map<string, ScrapedPage>> {
  const first = primary();
  const second = secondary();
  const byUrl = new Map<string, ScrapedPage>();

  if (first.scrapeBatch) {
    const scraped = await first
      .scrapeBatch(urls)
      .catch((err) => {
        tracker.note(err);
        if (!(err instanceof AnakinCreditError)) {
          console.warn(`[orch] ${first.name} batch scrape failed: ${(err as Error).message}`);
        }
        return [] as ScrapedPage[];
      });
    for (const p of scraped) byUrl.set(p.url, p);
  } else {
    const settled = await Promise.allSettled(
      urls.map((u) => withTimeout(first.scrape(u), opts.oneTimeoutMs ?? 12000, null))
    );
    settled.forEach((res, i) => {
      if (res.status === "fulfilled" && res.value) byUrl.set(urls[i], res.value);
      else if (res.status === "rejected") tracker.note(res.reason);
    });
  }

  const missing = urls.filter((u) => !byUrl.has(u));
  if (missing.length > 0 && second) {
    const filled = await Promise.allSettled(
      missing.map((u) => withTimeout(second.scrape(u), opts.oneTimeoutMs ?? 12000, null))
    );
    filled.forEach((res, i) => {
      if (res.status === "fulfilled" && res.value) byUrl.set(missing[i], res.value);
    });
  }

  return byUrl;
}

/** Firecrawl structured extract when Anakin cannot provide structured fields. */
export async function orchestratedExtract(
  url: string
): Promise<StructuredProductData | null> {
  const second = secondary();
  if (!second?.extractStructured) return null;
  try {
    return await second.extractStructured(url);
  } catch (err) {
    console.warn(`[orch] extract failed for ${url}: ${(err as Error).message}`);
    return null;
  }
}

export function listProviders(): string[] {
  return DEFAULT_PROVIDERS.filter((p) => p.name !== "firecrawl" || firecrawlEnabled()).map(
    (p) => p.name
  );
}
