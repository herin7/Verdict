import { Platform } from "react-native";
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

// Android emulator maps host loopback to 10.0.2.2. Override with EXPO_PUBLIC_API_URL.
const DEFAULT_HOST = Platform.OS === "android" ? "10.0.2.2" : "localhost";
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? `http://${DEFAULT_HOST}:8787`;

export async function identify(imageBase64: string): Promise<ProductIdentity> {
  const res = await fetch(`${BASE_URL}/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64 }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Identify failed");
  return (await res.json()).product;
}

export async function research(
  product: ProductIdentity
): Promise<{ report: ConsensusReport; buyLinks: BuyLink[] }> {
  const res = await fetch(`${BASE_URL}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Research failed");
  const json = await res.json();
  return { report: json.report, buyLinks: json.buyLinks ?? [] };
}

export async function findBuyLinks(query: string): Promise<BuyLink[]> {
  const res = await fetch(`${BASE_URL}/buy-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Buy-link lookup failed");
  return (await res.json()).links ?? [];
}

/** Best-effort real product photo lookup. Never throws - resolves null on any failure so the UI can fall back. */
export async function getProductImage(product: ProductIdentity): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/product-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product }),
    });
    if (!res.ok) return null;
    const json = await res.json();
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

/** Fetches a single deep-dive insight card. Independent of /research so a slow or failed one never blocks the report. */
export async function getInsight<T extends InsightType>(
  type: T,
  product: ProductIdentity
): Promise<InsightMap[T]> {
  const res = await fetch(`${BASE_URL}/insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, product }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Insight lookup failed");
  return (await res.json()).insight;
}
