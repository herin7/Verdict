import { firecrawlEnabled, type FirecrawlAction } from "../firecrawl.js";
import { HttpTimeoutError, withTimeoutReject } from "../http.js";
import { recordProviderCall } from "../ai/gateway.js";
import { firecrawlProvider } from "./firecrawlProvider.js";
import type {
  OrchestratedSearch,
  ResearchProvider,
  ScrapedPage,
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

/** Firecrawl is the sole research provider. */
const provider: ResearchProvider = firecrawlProvider;

export async function orchestratedSearch(
  task: SearchTask,
  opts: { limit?: number; timeoutMs?: number } = {}
): Promise<OrchestratedSearch> {
  const limit = opts.limit ?? 5;
  const timeoutMs = opts.timeoutMs ?? 12000;
  const start = Date.now();
  const controller = new AbortController();
  try {
    const results = await withTimeoutReject(
      provider.search(task.prompt, limit, controller.signal),
      timeoutMs,
      controller
    );
    recordResearchCall(`search:${task.type}`, provider.name, start, true);
    return { type: task.type, results, provider: provider.name };
  } catch (err) {
    const msg = err instanceof HttpTimeoutError ? "timeout" : (err as Error).message;
    recordResearchCall(`search:${task.type}`, provider.name, start, false, msg);
    if (!(err instanceof HttpTimeoutError)) {
      console.warn(`[orch] ${provider.name} search "${task.type}" failed: ${msg}`);
    }
    return { type: task.type, results: [], provider: provider.name };
  }
}

export async function orchestratedSearchMany(
  tasks: SearchTask[],
  opts: { limit?: number; timeoutMs?: number } = {}
): Promise<OrchestratedSearch[]> {
  return Promise.all(tasks.map((t) => orchestratedSearch(t, opts)));
}

export async function orchestratedScrape(
  urls: string[],
  opts: { oneTimeoutMs?: number } = {}
): Promise<Map<string, ScrapedPage>> {
  const byUrl = new Map<string, ScrapedPage>();
  const oneTimeoutMs = opts.oneTimeoutMs ?? 12_000;
  const start = Date.now();

  const settled = await Promise.allSettled(
    urls.map((u) => {
      const controller = new AbortController();
      return withTimeoutReject(provider.scrape(u, controller.signal), oneTimeoutMs, controller);
    })
  );
  settled.forEach((res, i) => {
    if (res.status === "fulfilled" && res.value) {
      byUrl.set(urls[i], res.value);
      recordResearchCall("scrape:one", provider.name, start, true);
    } else if (res.status === "rejected") {
      const msg = res.reason instanceof HttpTimeoutError ? "timeout" : (res.reason as Error)?.message;
      recordResearchCall("scrape:one", provider.name, start, false, msg);
    }
  });

  return byUrl;
}

export async function orchestratedExtract(
  url: string,
  opts: {
    timeoutMs?: number;
    proxy?: "basic" | "enhanced" | "auto";
    location?: { country: string; languages?: string[] };
    actions?: FirecrawlAction[];
  } = {}
): Promise<StructuredProductData | null> {
  if (!provider.extractStructured) return null;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const start = Date.now();
  const extractOpts =
    opts.proxy || opts.location || opts.actions
      ? {
          ...(opts.proxy ? { proxy: opts.proxy } : {}),
          ...(opts.location ? { location: opts.location } : {}),
          ...(opts.actions ? { actions: opts.actions } : {}),
        }
      : undefined;
  const controller = new AbortController();
  try {
    const result = await withTimeoutReject(
      provider.extractStructured(url, extractOpts, controller.signal),
      timeoutMs,
      controller
    );
    recordResearchCall("extract", provider.name, start, true);
    return result;
  } catch (err) {
    const msg = err instanceof HttpTimeoutError ? "timeout" : (err as Error).message;
    recordResearchCall("extract", provider.name, start, false, msg);
    console.warn(`[orch] extract failed for ${url}: ${msg}`);
    return null;
  }
}

export function listProviders(): string[] {
  return firecrawlEnabled() ? [provider.name] : [];
}
