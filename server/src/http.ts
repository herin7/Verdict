/** Shared fetch with AbortSignal timeout + backoff retries for provider HTTP. */

export class HttpTimeoutError extends Error {
  readonly code = "timeout";
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = "HttpTimeoutError";
  }
}

export type FetchWithRetryOptions = {
  timeoutMs?: number;
  retries?: number;
  /** Retry only these status codes (plus network/timeout). Default 429/502/503/504. */
  retryStatuses?: number[];
  /** Base delay ms; attempt n waits base * 2^n. */
  backoffMs?: number;
};

const DEFAULT_RETRY_STATUSES = [429, 502, 503, 504];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number, list: number[]): boolean {
  return list.includes(status);
}

/**
 * fetch() with wall-clock AbortSignal + optional retries on network/timeout/5xx/429.
 * Does not parse body; callers handle response as usual.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: FetchWithRetryOptions = {}
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const retries = opts.retries ?? 2;
  const retryStatuses = opts.retryStatuses ?? DEFAULT_RETRY_STATUSES;
  const backoffMs = opts.backoffMs ?? 300;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    if (init.signal) {
      if (init.signal.aborted) controller.abort();
      else init.signal.addEventListener("abort", onOuterAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", onOuterAbort);
      if (!res.ok && isRetryableStatus(res.status, retryStatuses) && attempt < retries) {
        await sleep(backoffMs * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", onOuterAbort);
      lastErr = err;
      const aborted =
        (err as { name?: string })?.name === "AbortError" ||
        String((err as Error)?.message ?? "").toLowerCase().includes("abort");
      if (aborted && !init.signal?.aborted) {
        lastErr = new HttpTimeoutError(timeoutMs);
      }
      if (attempt === retries) break;
      await sleep(backoffMs * 2 ** attempt);
    }
  }
  throw lastErr;
}

/**
 * Race a promise against a timeout; rejects with HttpTimeoutError. Pass the
 * SAME AbortController whose signal was given to `p`'s underlying fetch, and
 * this aborts it when the timeout wins the race - without that, a "timed
 * out" call (as far as the caller is concerned) keeps running in the
 * background: still retrying, still holding a connection, and its eventual
 * (much later) completion still gets recorded as if it mattered.
 */
export async function withTimeoutReject<T>(p: Promise<T>, ms: number, controller?: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          controller?.abort();
          reject(new HttpTimeoutError(ms));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
