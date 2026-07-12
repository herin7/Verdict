import { Platform } from "react-native";
import type { ConsensusReport, ProductIdentity } from "../types";

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

export async function research(product: ProductIdentity): Promise<ConsensusReport> {
  const res = await fetch(`${BASE_URL}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Research failed");
  return (await res.json()).report;
}
