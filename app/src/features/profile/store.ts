import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "../../api/client";
import type { BuyerProfile } from "./questions";

const PROFILE_KEY = "verdict.buyerProfile.v1";
const CALIBRATION_ASKED_KEY = "verdict.calibrationAskedAt.v1";

/** Onboarding runs before sign-in, so the profile lives on the device first. */
export async function readProfile(): Promise<BuyerProfile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY).catch(() => null);
  return raw ? (JSON.parse(raw) as BuyerProfile) : null;
}

export async function writeProfile(profile: BuyerProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

/** Server copy: what every verdict is personalised against. */
export function uploadProfile(profile: BuyerProfile) {
  return apiRequest<{ profile: BuyerProfile }>("/profile", { method: "PUT", body: JSON.stringify({ profile }) });
}

/** Calibration questions are occasional: at most one every few days. */
const CALIBRATION_GAP_MS = 3 * 24 * 60 * 60 * 1000;

export async function calibrationDue(): Promise<boolean> {
  const last = Number(await AsyncStorage.getItem(CALIBRATION_ASKED_KEY).catch(() => null));
  return !last || Date.now() - last > CALIBRATION_GAP_MS;
}

export async function markCalibrationAsked(): Promise<void> {
  await AsyncStorage.setItem(CALIBRATION_ASKED_KEY, String(Date.now())).catch(() => {});
}
