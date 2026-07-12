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
  url?: string;
  status?: "pending" | "processing" | "completed" | "failed";
  markdown?: string;
  error?: string;
}

interface JobStatusResponse {
  id?: string;
  status?: "pending" | "processing" | "completed" | "failed";
  markdown?: string;
  error?: string;
  results?: ScrapeResultRow[];
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
  if (!res.ok && res.status !== 202) {
    const msg = json?.message || json?.error || res.statusText;
    throw new Error(`Anakin ${path} failed (${res.status}): ${msg}`);
  }
  return json;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Anakin's URL Scraper (submit + batch) is asynchronous: the POST only returns
 * a job id, real results come from polling GET /v1/url-scraper/{id}.
 * Recommended interval per Anakin docs: 2-5s, typical completion 3-15s.
 */
async function pollScrapeJob(
  id: string,
  { intervalMs = 2000, timeoutMs = 20000 }: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<JobStatusResponse | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job: JobStatusResponse = await anakinRequest("GET", `/url-scraper/${id}`);
    if (job.status === "completed" || job.status === "failed") return job;
    await sleep(intervalMs);
  }
  return null;
}

/** Synchronous AI web search. Returns ranked citations. Anakin's core research primitive. */
export async function search(prompt: string, limit = 8): Promise<SearchResult[]> {
  const json = await anakinRequest("POST", "/search", { prompt, limit });
  return Array.isArray(json?.results) ? json.results : [];
}

/**
 * Batch scrape up to 10 URLs to markdown via Anakin. Submits the async job then
 * polls to completion (or gives up gracefully within the timeout budget).
 */
export async function scrapeBatch(
  urls: string[],
  opts: { timeoutMs?: number } = {}
): Promise<ScrapedPage[]> {
  if (urls.length === 0) return [];
  const capped = urls.slice(0, 10);

  const submitted = await anakinRequest("POST", "/url-scraper/batch", {
    urls: capped,
    generateJson: false,
  });
  const jobId: string | undefined = submitted?.jobId ?? submitted?.id;
  if (!jobId) return [];

  const job = await pollScrapeJob(jobId, { timeoutMs: opts.timeoutMs ?? 20000 });
  if (!job || job.status !== "completed") return [];

  const rows = Array.isArray(job.results) ? job.results : [];
  return rows
    .filter((r): r is ScrapeResultRow & { url: string; markdown: string } =>
      Boolean(r.status === "completed" && r.url && r.markdown)
    )
    .map((r) => ({ url: r.url, markdown: r.markdown }));
}

/** Inline single-URL scrape: blocks until done (falls back to polling if Anakin times out first). */
export async function scrape(url: string, opts: { timeoutMs?: number } = {}): Promise<ScrapedPage | null> {
  const json: JobStatusResponse = await anakinRequest("POST", "/url-scraper/scrape", { url });
  if (json.status === "completed" && json.markdown) {
    return { url, markdown: json.markdown };
  }
  if (json.status === "failed" || !json.id) return null;

  const job = await pollScrapeJob(json.id, { timeoutMs: opts.timeoutMs ?? 15000 });
  if (!job || job.status !== "completed" || !job.markdown) return null;
  return { url, markdown: job.markdown };
}
