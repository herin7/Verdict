import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface UserLocation {
  lat: number;
  lon: number;
}

const CACHE_KEY = "verdict.location.v1";
// Delivery location rarely changes mid-session - cache to avoid re-hitting the
// location APIs on every compare/search call.
const CACHE_TTL_MS = 30 * 60 * 1000;

let memo: { at: number; loc: UserLocation | null } | null = null;

async function readCache(): Promise<{ at: number; loc: UserLocation | null } | null> {
  if (memo) return memo;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.at === "number") {
      memo = parsed;
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function writeCache(loc: UserLocation | null): Promise<void> {
  memo = { at: Date.now(), loc };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(memo)).catch(() => {});
}

async function clearCache(): Promise<void> {
  memo = null;
  await AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
}

export async function hasLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === Location.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}

export type LocationPermissionResult = "granted" | "denied" | "unavailable";

/**
 * Explicit, user-initiated permission request - only call this from a deliberate
 * tap (e.g. a "use my location" banner), never automatically on app start, so the
 * OS prompt never ambushes users mid-flow. Never throws.
 */
export async function requestLocationPermission(): Promise<LocationPermissionResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === Location.PermissionStatus.GRANTED) {
      await clearCache();
      return "granted";
    }
    return "denied";
  } catch {
    return "unavailable";
  }
}

/**
 * Best-effort approximate location for location-gated quick-commerce platforms
 * (Blinkit/BigBasket delivery-area pricing). Soft-fails to null in every case -
 * never requests permission itself, never throws - so callers can always fall
 * back to the existing country-level default behavior.
 */
export async function getUserLocation(): Promise<UserLocation | null> {
  try {
    const cached = await readCache();
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.loc;

    if (!(await hasLocationPermission())) {
      await writeCache(null);
      return null;
    }

    const last = await Location.getLastKnownPositionAsync({}).catch(() => null);
    const pos =
      last ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }).catch(() => null));
    if (!pos) {
      await writeCache(null);
      return null;
    }

    const loc: UserLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    await writeCache(loc);
    return loc;
  } catch {
    return null;
  }
}
