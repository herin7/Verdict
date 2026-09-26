import { Platform } from "react-native";
import { getAccessToken } from "../lib/supabase";
import type { BestInCategory, InsightType, LongTermScore, ProductIdentity, ScamDetector, VersionHistory } from "../types";

const DEFAULT_HOST = Platform.OS === "android" ? "10.0.2.2" : "localhost";
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? `http://${DEFAULT_HOST}:8787`;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type ApiRequestOptions = RequestInit & { timeoutMs?: number };

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

async function api<T>(path: string, init?: ApiRequestOptions): Promise<T> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal: callerSignal, ...request } = init ?? {};
  const controller = new AbortController();
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const cancelFromCaller = () => controller.abort();
  callerSignal?.addEventListener("abort", cancelFromCaller, { once: true });

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...request,
      signal: controller.signal,
      headers: { ...(await authHeaders()), ...(request.headers as Record<string, string>) },
    });
  } catch (cause) {
    if (didTimeout) {
      throw new ApiError("This is taking longer than expected. Please try again.", 408, "timeout");
    }
    if (callerSignal?.aborted) {
      throw new ApiError("Request cancelled", 499, "cancelled");
    }
    throw new ApiError(
      "Verdict cannot reach the server. Check your connection and try again.",
      0,
      "network"
    );
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", cancelFromCaller);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const serverMessage = (body as { error?: string }).error;
    const message = messageForStatus(res.status, serverMessage);
    throw new ApiError(message, res.status, (body as { code?: string }).code);
  }
  return res.json() as Promise<T>;
}

function messageForStatus(status: number, serverMessage?: string): string {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have access to this action.";
  if (status === 408 || status === 504) return "This is taking longer than expected. Please try again.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status >= 500) return "Verdict is temporarily unavailable. Please try again shortly.";
  return serverMessage ?? `Request failed (${status})`;
}

/** Shared authenticated transport for feature-local API modules. */
export function apiRequest<T>(path: string, init?: ApiRequestOptions): Promise<T> {
  return api<T>(path, init);
}

interface InsightMap {
  "long-term": LongTermScore;
  "version-history": VersionHistory;
  "scam-detector": ScamDetector;
  "best-in-category": BestInCategory;
}

export async function getInsight<T extends InsightType>(
  type: T,
  product: ProductIdentity
): Promise<InsightMap[T]> {
  const json = await api<{ insight: InsightMap[T] }>("/insights", {
    method: "POST",
    body: JSON.stringify({ type, product }),
  });
  return json.insight;
}
