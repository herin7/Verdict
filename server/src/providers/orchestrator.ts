import { AnakinCreditError, type SearchResult, type ScrapedPage } from "../anakin.js";
import { firecrawlEnabled } from "../firecrawl.js";
import { HttpTimeoutError, withTimeoutReject } from "../http.js";
import { recordProviderCall } from "../ai/gateway.js";
import { anakinProvider } from "./anakinProvider.js";
import { firecrawlProvider } from "./firecrawlProvider.js";
import type {
  OrchestratedSearch,
  ResearchProvider,
  SearchTask,
  StructuredProductData,
} from "./types.js";

function recordResearchCall(op: string, provider: string, start: number, ok: boolean, error?: string) {
  recordProviderCall({
    kind: "research",
    workload: op,
    provider,
    latencyMs: Date.now() - start,
    ok,
    error,
  });
}

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

/** Soft timeout: returns fallback if promise still pending. Does not abort work. */
async function withTimeoutFallback<T>(p: Promise<T>, ms: number, fallback: T): Promise<{ value: T; timedOut: boolean }> {
  let timedOut = false;
  const value = await Promise.race([
    p,
    new Promise<T>((resolve) =>
      setTimeout(() => {
        timedOut = true;
        resolve(fallback);
      }, ms)
    ),
  ]);
  return { value, timedOut };
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

  const firstStart = Date.now();
  try {
    const { value: results, timedOut } = await withTimeoutFallback(
      first.search(task.prompt, limit),
      timeoutMs,
      [] as SearchResult[]
    );
    if (timedOut && results.length === 0) {
      recordResearchCall(`search:${task.type}`, first.name, firstStart, false, "timeout");
    } else {
      recordResearchCall(`search:${task.type}`, first.name, firstStart, true);
      if (results.length >= min) {
        return { type: task.type, results, provider: first.name };
      }
    }
  } catch (err) {
    recordResearchCall(`search:${task.type}`, first.name, firstStart, false, (err as Error).message);
    tracker.note(err);
    if (!(err instanceof AnakinCreditError)) {
      console.warn(`[orch] ${first.name} search "${task.type}" failed: ${(err as Error).message}`);
    }
  }

  if (second) {
    const secondStart = Date.now();
    try {
      const { value: results, timedOut } = await withTimeoutFallback(
        second.search(task.prompt, limit),
        timeoutMs,
        [] as SearchResult[]
      );
      if (timedOut && results.length === 0) {
        recordResearchCall(`search:${task.type}`, second.name, secondStart, false, "timeout");
      } else {
        recordResearchCall(`search:${task.type}`, second.name, secondStart, true);
        return { type: task.type, results, provider: second.name };
      }
    } catch (err) {
      recordResearchCall(`search:${task.type}`, second.name, secondStart, false, (err as Error).message);
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
  const batchTimeoutMs = opts.batchTimeoutMs ?? 22_000;
  const oneTimeoutMs = opts.oneTimeoutMs ?? 12_000;

  if (first.scrapeBatch) {
    const batchStart = Date.now();
    try {
      const scraped = await withTimeoutReject(first.scrapeBatch(urls), batchTimeoutMs);
      recordResearchCall("scrape:batch", first.name, batchStart, true);
      for (const p of scraped) byUrl.set(p.url, p);
    } catch (err) {
      const msg = err instanceof HttpTimeoutError ? "timeout" : (err as Error).message;
      recordResearchCall("scrape:batch", first.name, batchStart, false, msg);
      tracker.note(err);
      if (!(err instanceof AnakinCreditError) && !(err instanceof HttpTimeoutError)) {
        console.warn(`[orch] ${first.name} batch scrape failed: ${msg}`);
      }
    }
  } else {
    const oneStart = Date.now();
    const settled = await Promise.allSettled(
      urls.map((u) => withTimeoutFallback(first.scrape(u), oneTimeoutMs, null).then((r) => r.value))
    );
    settled.forEach((res, i) => {
      if (res.status === "fulfilled" && res.value) {
        byUrl.set(urls[i], res.value);
        recordResearchCall("scrape:one", first.name, oneStart, true);
      } else if (res.status === "rejected") {
        recordResearchCall("scrape:one", first.name, oneStart, false, (res.reason as Error)?.message);
        tracker.note(res.reason);
      }
    });
  }

  const missing = urls.filter((u) => !byUrl.has(u));
  if (missing.length > 0 && second) {
    const missingStart = Date.now();
    const filled = await Promise.allSettled(
      missing.map((u) => withTimeoutFallback(second.scrape(u), oneTimeoutMs, null).then((r) => r.value))
    );
    filled.forEach((res, i) => {
      if (res.status === "fulfilled" && res.value) {
        byUrl.set(missing[i], res.value);
        recordResearchCall("scrape:one", second.name, missingStart, true);
      } else if (res.status === "rejected") {
        recordResearchCall("scrape:one", second.name, missingStart, false, (res.reason as Error)?.message);
      }
    });
  }

  return byUrl;
}

/** Firecrawl structured extract when Anakin cannot provide structured fields. */
export async function orchestratedExtract(
  url: string,
  opts: {
    timeoutMs?: number;
    proxy?: "basic" | "enhanced" | "auto";
    location?: { country: string; languages?: string[] };
  } = {}
): Promise<StructuredProductData | null> {
  const second = secondary();
  if (!second?.extractStructured) return null;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const start = Date.now();
  const extractOpts =
    opts.proxy || opts.location
      ? { ...(opts.proxy ? { proxy: opts.proxy } : {}), ...(opts.location ? { location: opts.location } : {}) }
      : undefined;
  try {
    const result = await withTimeoutReject(second.extractStructured(url, extractOpts), timeoutMs);
    recordResearchCall("extract", second.name, start, true);
    return result;
  } catch (err) {
    const msg = err instanceof HttpTimeoutError ? "timeout" : (err as Error).message;
    recordResearchCall("extract", second.name, start, false, msg);
    console.warn(`[orch] extract failed for ${url}: ${msg}`);
    return null;
  }
}

export function listProviders(): string[] {
  return DEFAULT_PROVIDERS.filter((p) => p.name !== "firecrawl" || firecrawlEnabled()).map(
    (p) => p.name
  );
}
