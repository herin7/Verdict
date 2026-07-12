import { config } from "./config.js";

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  date?: string;
  last_updated?: string;
}

export interface ScrapedPage {
  url: string;
  markdown: string;
}

interface ScrapeResultRow {
  index?: number;
  url?: string;
  status?: "pending" | "processing" | "completed" | "failed";
  markdown?: string;
  error?: string;
}

interface JobStatusResponse {
  id?: string;
  status?: "pending" | "processing" | "completed" | "failed";
  markdown?: string;
  html?: string;
  error?: string;
  results?: ScrapeResultRow[];
}

/** Thrown when Anakin rejects a call for lack of credits (HTTP 402). */
export class AnakinCreditError extends Error {
  readonly status = 402;
  constructor(message: string) {
    super(message);
    this.name = "AnakinCreditError";
  }
}

async function anakinRequest(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${config.anakinBaseUrl}${path}`, {
    method,
    headers: {
      "X-API-Key": config.anakinApiKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || res.statusText;
    if (res.status === 402) {
      throw new AnakinCreditError(`Anakin out of credits: ${msg}`);
    }
    throw new Error(`Anakin ${path} failed (${res.status}): ${msg}`);
  }
  return json;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll an async Anakin job to a terminal state. Per Anakin docs: wait ~1s after
 * submit, then poll every 1-2s until status is completed or failed. `pollPath`
 * differs for single (/url-scraper/{id}) vs batch (/url-scraper/batch/{id}).
 */
async function pollJob(
  pollPath: string,
  { intervalMs = 1500, timeoutMs = 20000 }: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<JobStatusResponse | null> {
  const start = Date.now();
  await sleep(1000);
  while (Date.now() - start < timeoutMs) {
    const job: JobStatusResponse = await anakinRequest("GET", pollPath);
    if (job.status === "completed" || job.status === "failed") return job;
    await sleep(intervalMs);
  }
  return null;
}

function normalizeCitation(row: any): SearchResult | null {
  if (!row || typeof row !== "object") return null;
  const url: string | undefined = row.url ?? row.link ?? row.source ?? row.href;
  if (!url || typeof url !== "string") return null;
  return {
    url,
    title: row.title ?? row.name ?? row.heading ?? "",
    snippet: row.snippet ?? row.content ?? row.text ?? row.description ?? row.summary ?? "",
    date: row.date,
    last_updated: row.last_updated ?? row.lastUpdated,
  };
}

/**
 * Synchronous AI web search (3 credits). The hosted API has returned citations
 * under different keys across versions, so parse defensively rather than assume
 * a single field, and surface the real shape when nothing parses.
 */
export async function search(prompt: string, limit = 5): Promise<SearchResult[]> {
  const json = await anakinRequest("POST", "/search", { prompt, limit });
  const rows: unknown =
    json?.citations ?? json?.results ?? json?.data ?? json?.sources ?? [];
  if (!Array.isArray(rows)) return [];
  const mapped = rows
    .map(normalizeCitation)
    .filter((r): r is SearchResult => r !== null);
  if (mapped.length === 0) {
    console.warn(
      `[anakin] /search parsed 0 citations. Top-level response keys: ${Object.keys(json ?? {}).join(", ") || "(none)"}`
    );
  }
  return mapped;
}

/**
 * Batch scrape up to 10 URLs to markdown (1 credit/URL). Submits the async batch
 * job via /url-scraper/batch, then polls the SAME generic /url-scraper/{jobId}
 * endpoint used for single scrapes - there is no separate /url-scraper/batch/{id}
 * poll route on the hosted API (confirmed against Anakin's own agent skill doc).
 */
export async function scrapeBatch(
  urls: string[],
  opts: { timeoutMs?: number } = {}
): Promise<ScrapedPage[]> {
  if (urls.length === 0) return [];
  const capped = urls.slice(0, 10);

  const submitted = await anakinRequest("POST", "/url-scraper/batch", { urls: capped });
  const jobId: string | undefined = submitted?.id ?? submitted?.jobId;
  if (!jobId) return [];

  const job = await pollJob(`/url-scraper/${jobId}`, { timeoutMs: opts.timeoutMs ?? 20000 });
  if (!job) return [];

  const rows = Array.isArray(job.results) ? job.results : [];
  return rows
    .filter((r): r is ScrapeResultRow & { url: string; markdown: string } =>
      Boolean(r.status === "completed" && r.url && r.markdown)
    )
    .map((r) => ({ url: r.url, markdown: r.markdown }));
}

/** Async single-URL scrape (1 credit): submit to /url-scraper, then poll /url-scraper/{jobId}. */
export async function scrape(url: string, opts: { timeoutMs?: number } = {}): Promise<ScrapedPage | null> {
  const submitted: JobStatusResponse = await anakinRequest("POST", "/url-scraper", { url });
  if (!submitted.id) return null;

  const job = await pollJob(`/url-scraper/${submitted.id}`, { timeoutMs: opts.timeoutMs ?? 15000 });
  if (!job || job.status !== "completed" || !job.markdown) return null;
  return { url, markdown: job.markdown };
}

/** Same async scrape, but returns raw HTML instead of markdown - used for meta-tag extraction (og:image). */
export async function scrapeHtml(url: string, opts: { timeoutMs?: number } = {}): Promise<string | null> {
  const submitted: JobStatusResponse = await anakinRequest("POST", "/url-scraper", { url });
  if (!submitted.id) return null;

  const job = await pollJob(`/url-scraper/${submitted.id}`, { timeoutMs: opts.timeoutMs ?? 12000 });
  if (!job || job.status !== "completed" || !job.html) return null;
  return job.html;
}
