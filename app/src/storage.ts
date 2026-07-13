import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SavedReport } from "./types";

const KEY = "verdict.savedReports.v1";
const MAX_SAVED = 200;
const ONBOARDING_KEY = "verdict.onboarding.done.v1";
const SCAN_COUNT_KEY = "verdict.scanCount.v1";
const PAYMENT_KEY = "verdict.paymentMethods.v1";
const COUNTRY_KEY = "verdict.country.v1";

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

export async function getOnboardingDone(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_KEY)) === "1";
}

export async function setOnboardingDone(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, "1");
}

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

export async function setScanCount(n: number): Promise<void> {
  await AsyncStorage.setItem(SCAN_COUNT_KEY, String(n));
}

export async function getLocalPaymentMethods(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(PAYMENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setLocalPaymentMethods(methods: string[]): Promise<void> {
  await AsyncStorage.setItem(PAYMENT_KEY, JSON.stringify(methods));
}

export async function getCountryOverride(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(COUNTRY_KEY);
  } catch {
    return null;
  }
}

export async function setCountryOverride(country: string): Promise<void> {
  await AsyncStorage.setItem(COUNTRY_KEY, country);
}
