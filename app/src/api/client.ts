import { Platform } from "react-native";
import { getAccessToken } from "../lib/supabase";
import type {
  BestInCategory,
  BuyLink,
  ConsensusReport,
  InsightType,
  LongTermScore,
  ProductIdentity,
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init?.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
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
    body: JSON.stringify({ product }),
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
}> {
  const json = await api<{
    product: ProductIdentity;
    sourceUrl: string;
    marketplaceId: string | null;
    method: string;
  }>("/identify-url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  return json;
}

export async function identifyScreen(text: string, packageName: string): Promise<ProductIdentity> {
  const json = await api<{ product: ProductIdentity }>("/identify-screen", {
    method: "POST",
    body: JSON.stringify({ text, packageName }),
  });
  return json.product;
}

export async function compareEverywhere(product: ProductIdentity, gtin?: string | null) {
  return api<{
    offers: import("../types").MarketplaceOffer[];
    productId: string | null;
    cached: boolean;
  }>("/compare", {
    method: "POST",
    body: JSON.stringify({ product, gtin: gtin ?? null }),
  });
}

export async function fetchDeals(product: ProductIdentity, methods?: string[]) {
  return api<{
    deals: import("../types").RankedDeal[];
    productId: string | null;
    cached: boolean;
    methodsUsed: string[];
  }>("/deals", {
    method: "POST",
    body: JSON.stringify({ product, methods }),
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
