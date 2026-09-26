import type { ShareIntent } from "expo-share-intent";

export interface SharedPayload {
  text: string | null;
  imageUri: string | null;
}

/** Turns whatever another app shared into the text and/or screenshot we upload. Null when there's nothing usable. */
export function sharedPayload(intent: ShareIntent): SharedPayload | null {
  const image = intent.files?.find((f) => f.mimeType.startsWith("image/"));
  // Some apps put the link only in webUrl, others only in text; keep both without duplicating.
  const shared = intent.text?.trim() || null;
  const url = intent.webUrl?.trim() || null;
  const text = shared && url && !shared.includes(url) ? `${shared} ${url}` : (shared ?? url);
  // Android hands back bare filesystem paths; the image pipeline wants a URI.
  const imageUri = image ? (image.path.startsWith("/") ? `file://${image.path}` : image.path) : null;
  return text || imageUri ? { text, imageUri } : null;
}
