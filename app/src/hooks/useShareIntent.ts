import { useCallback, useEffect, useState } from "react";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";

/** Pulls shared URL/text from Android share-target into the scan flow. */
export function useShareIntentUrl(onUrl: (url: string) => void) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent || !shareIntent) return;
    const webUrl = shareIntent.webUrl;
    const text = shareIntent.text;
    const candidate =
      (typeof webUrl === "string" && webUrl) ||
      (typeof text === "string" && text.match(/https?:\/\/\S+/)?.[0]) ||
      null;
    if (candidate) {
      onUrl(candidate.trim());
      resetShareIntent();
    }
  }, [hasShareIntent, shareIntent, onUrl, resetShareIntent]);
}

export { ShareIntentProvider };

export function useStableUrlHandler(handler: (url: string) => void) {
  return useCallback(handler, [handler]);
}
