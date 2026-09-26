import { apiRequest } from "../../api/client";
import type { ServerShare } from "./types";

export function createShare(body: { clientId: string; text?: string; imageBase64?: string }) {
  return apiRequest<{ share: ServerShare }>("/shares", {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 20_000,
  });
}

/** Only rows changed after `since` (server clock), or everything when omitted. */
export function fetchShares(since?: number) {
  return apiRequest<{ shares: ServerShare[]; serverTime: number }>(`/shares${since ? `?since=${since}` : ""}`);
}

export function retryShare(id: string, product?: string) {
  return apiRequest<{ share: ServerShare }>(`/shares/${id}/retry`, {
    method: "POST",
    body: JSON.stringify(product ? { product } : {}),
  });
}

export function deleteShare(id: string) {
  return apiRequest<{ ok: boolean }>(`/shares/${id}`, { method: "DELETE" });
}

export function registerDevice(expoToken: string, platform: string) {
  return apiRequest<{ ok: boolean }>("/devices", { method: "POST", body: JSON.stringify({ expoToken, platform }) });
}
