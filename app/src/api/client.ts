import { Platform } from "react-native";
import { getAccessToken } from "../lib/supabase";
import { getCountry } from "../country";
import { getUserLocation } from "../location";
import type {
  BestInCategory,
  BuyLink,
  ConsensusReport,
  InsightType,
  LongTermScore,
  ProductIdentity,
  ReferencePrice,
  ScamDetector,
  VersionHistory,
} from "../types";

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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...(await authHeaders()), ...(init?.headers as Record<string, string>) },
    });
  } catch {
    throw new ApiError("Cannot reach Verdict server. Check connection and EXPO_PUBLIC_API_URL.", 0, "network");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as { error?: string }).error ??
      (res.status === 503
        ? "Service temporarily unavailable"
        : res.status === 402
          ? "Research credits exhausted"
          : `Request failed (${res.status})`);
    throw new ApiError(message, res.status, (body as { code?: string }).code);
  }
  return res.json() as Promise<T>;
}

async function withCountry<T extends Record<string, unknown>>(body: T): Promise<T & { country: string }> {
  const country = await getCountry();
  return { ...body, country };
}

/** Adds the user's approximate location when permission was granted - purely
 *  additive (existing callers/server behavior are unaffected when omitted).
 *  Only meaningful for marketplace compare/deals/search calls, not identify/research. */
async function withLocation<T extends Record<string, unknown>>(
  body: T
): Promise<T & { location?: { lat: number; lon: number } }> {
  const location = await getUserLocation().catch(() => null);
  return location ? { ...body, location } : body;
}

export async function identify(imageBase64: string): Promise<ProductIdentity> {
  const json = await api<{ product: ProductIdentity }>("/identify", {
    method: "POST",
    body: JSON.stringify({ imageBase64 }),
  });
  return json.product;
}

export async function research(
  product: ProductIdentity
): Promise<{ report: ConsensusReport; buyLinks: BuyLink[]; productId: string | null; cached: boolean }> {
  const json = await api<{
    report: ConsensusReport;
    buyLinks: BuyLink[];
    productId?: string | null;
    cached?: boolean;
  }>("/research", {
    method: "POST",
    body: JSON.stringify(await withCountry({ product })),
  });
  return {
    report: json.report,
    buyLinks: json.buyLinks ?? [],
    productId: json.productId ?? null,
    cached: Boolean(json.cached),
  };
}

export async function findBuyLinks(query: string): Promise<BuyLink[]> {
  const json = await api<{ links: BuyLink[] }>("/buy-link", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  return json.links ?? [];
}

export async function getProductImage(product: ProductIdentity): Promise<string | null> {
  try {
    const json = await api<{ imageUrl: string | null }>("/product-image", {
      method: "POST",
      body: JSON.stringify({ product }),
    });
    return typeof json.imageUrl === "string" ? json.imageUrl : null;
  } catch {
    return null;
  }
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

export async function fetchSavedReports() {
  return api<{
    items: Array<{
      id: string;
      savedAt: number;
      productId: string;
      product: ProductIdentity;
      report: ConsensusReport | null;
      buyLinks: BuyLink[];
      imageUrl: string | null;
    }>;
  }>("/me/saved");
}

export async function saveRemoteReport(productId: string) {
  return api<{ ok: boolean }>("/me/saved", {
    method: "POST",
    body: JSON.stringify({ productId }),
  });
}

export async function deleteRemoteReport(productId: string) {
  return api<{ ok: boolean }>(`/me/saved/${productId}`, { method: "DELETE" });
}

export async function fetchScanStats() {
  return api<{
    count: number;
    items: Array<{
      id: string;
      createdAt: number;
      productId: string;
      product: ProductIdentity;
      imageUrl: string | null;
    }>;
  }>("/me/scans");
}

export async function identifyUrl(url: string): Promise<{
  product: ProductIdentity;
  sourceUrl: string;
  marketplaceId: string | null;
  method: string;
  referencePrice: ReferencePrice | null;
}> {
  const json = await api<{
    product: ProductIdentity;
    sourceUrl: string;
    marketplaceId: string | null;
    method: string;
    referencePrice?: ReferencePrice | null;
  }>("/identify-url", {
    method: "POST",
    body: JSON.stringify(await withCountry({ url })),
  });
  return { ...json, referencePrice: json.referencePrice ?? null };
}

export async function identifyScreen(
  text: string,
  packageName: string
): Promise<{ product: ProductIdentity; referencePrice: ReferencePrice | null }> {
  const json = await api<{ product: ProductIdentity; referencePrice?: ReferencePrice | null }>(
    "/identify-screen",
    {
      method: "POST",
      body: JSON.stringify(await withCountry({ text, packageName })),
    }
  );
  return { product: json.product, referencePrice: json.referencePrice ?? null };
}

export async function compareEverywhere(
  product: ProductIdentity,
  gtin?: string | null,
  reference?: ReferencePrice | null
) {
  return api<{
    offers: import("../types").MarketplaceOffer[];
    productId: string | null;
    cached: boolean;
  }>("/compare", {
    method: "POST",
    body: JSON.stringify(
      await withLocation(await withCountry({ product, gtin: gtin ?? null, reference: reference ?? null }))
    ),
  });
}

export async function fetchDeals(
  product: ProductIdentity,
  methods?: string[],
  reference?: ReferencePrice | null
) {
  return api<{
    deals: import("../types").RankedDeal[];
    productId: string | null;
    cached: boolean;
    methodsUsed: string[];
  }>("/deals", {
    method: "POST",
    body: JSON.stringify(await withLocation(await withCountry({ product, methods, reference: reference ?? null }))),
  });
}

/**
 * Direct/manual search - free-text query, skips screenshot/screen identify and
 * treats the query as the product name directly. Backed by POST /search.
 */
export async function directSearch(query: string, methods?: string[]) {
  return api<{
    product: ProductIdentity;
    offers: import("../types").MarketplaceOffer[];
    deals: import("../types").RankedDeal[];
    productId: string | null;
    cached: boolean;
    methodsUsed: string[];
    country: string;
  }>("/search", {
    method: "POST",
    body: JSON.stringify(await withLocation(await withCountry({ query, methods }))),
  });
}

export async function getPaymentProfile() {
  return api<{
    methods: import("../types").PaymentMethodId[];
    catalog: import("../types").PaymentCatalogItem[];
  }>("/me/payment-profile");
}

export async function savePaymentProfile(methods: string[]) {
  return api<{ ok: boolean; methods: string[] }>("/me/payment-profile", {
    method: "PUT",
    body: JSON.stringify({ methods }),
  });
}

export async function getDealsCatalog() {
  return api<{ methods: import("../types").PaymentCatalogItem[] }>("/deals/catalog");
}

export type MissionDto = {
  id: string;
  title: string;
  goal: string;
  status: string;
  country: string;
  constraints: {
    maxPrice?: number;
    currency?: string;
    watchUrls?: string[];
    autoMonitor?: boolean;
  };
  product: ProductIdentity | null;
  proposal: {
    summary: string;
    action: "buy" | "wait" | "monitor" | "skip";
    requiresApproval: true;
    buyLinks: Array<{ retailer: string; url: string; price?: string | null }>;
    dealsCount: number;
    offersCount: number;
    verdict?: "buy" | "wait" | "avoid" | "mixed" | null;
    maxPriceOk?: boolean | null;
    createdAt: number;
  } | null;
  monitorId: string | null;
  events: Array<{ at: number; type: string; meta?: Record<string, unknown> }>;
  createdAt: number;
  updatedAt: number;
};

export async function fetchMissionsStatus() {
  return api<{ enabled: boolean; firecrawlMonitors: boolean; webhookConfigured: boolean }>(
    "/missions/status"
  );
}

export async function fetchMissions() {
  return api<{ items: MissionDto[]; enabled: boolean }>("/missions");
}

export async function createMission(body: {
  title: string;
  goal: string;
  country?: string;
  product?: Partial<ProductIdentity> & { name: string };
  constraints?: {
    maxPrice?: number;
    watchUrls?: string[];
    autoMonitor?: boolean;
  };
  runNow?: boolean;
}) {
  return api<{ mission: MissionDto }>("/missions", {
    method: "POST",
    body: JSON.stringify(await withCountry(body)),
  });
}

export async function fetchMission(id: string) {
  return api<{ mission: MissionDto }>(`/missions/${id}`);
}

export async function runMission(id: string) {
  return api<{ mission: MissionDto }>(`/missions/${id}/run`, { method: "POST" });
}

export async function approveMission(id: string) {
  return api<{ mission: MissionDto }>(`/missions/${id}/approve`, { method: "POST" });
}

export async function rejectMission(id: string) {
  return api<{ mission: MissionDto }>(`/missions/${id}/reject`, { method: "POST" });
}

export async function cancelMission(id: string) {
  return api<{ mission: MissionDto }>(`/missions/${id}/cancel`, { method: "POST" });
}
