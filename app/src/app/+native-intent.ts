import { getShareExtensionKey } from "expo-share-intent";

/**
 * Rewrites incoming OS links before the router sees them: share-sheet launches
 * go to /incoming (which reads the shared payload). Everything else
 * (verdict://item/<id>, …) maps to routes as-is.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return path.includes(`dataUrl=${getShareExtensionKey()}`) ? "/incoming" : path;
  } catch {
    return "/";
  }
}
