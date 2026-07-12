import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SavedReport } from "./types";

const KEY = "verdict.savedReports.v1";
const MAX_SAVED = 200;

export function makeReportId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getSavedReports(): Promise<SavedReport[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveReport(entry: SavedReport): Promise<void> {
  const all = await getSavedReports();
  const next = [entry, ...all.filter((r) => r.id !== entry.id)].slice(0, MAX_SAVED);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function deleteReport(id: string): Promise<void> {
  const all = await getSavedReports();
  await AsyncStorage.setItem(KEY, JSON.stringify(all.filter((r) => r.id !== id)));
}

// --- Dummy auth session ---------------------------------------------------
// Placeholder only, per product decision: any non-empty username/password is
// accepted. Swap for real auth later without touching call sites.

const SESSION_KEY = "verdict.session.v1";

export interface Session {
  username: string;
}

export async function getSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.username ? parsed : null;
  } catch {
    return null;
  }
}

export async function setSession(username: string): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ username }));
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

// --- Scan stats -------------------------------------------------------------

const SCAN_COUNT_KEY = "verdict.scanCount.v1";

export async function getScanCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(SCAN_COUNT_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function incrementScanCount(): Promise<number> {
  const next = (await getScanCount()) + 1;
  await AsyncStorage.setItem(SCAN_COUNT_KEY, String(next));
  return next;
}
