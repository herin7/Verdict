import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { createShare, deleteShare, fetchShares, retryShare } from "./api";
import { findItem, mergeShares } from "./merge";
import { addToOutbox, imageBase64, readOutbox, removeFromOutbox } from "./outbox";
import { isWorking, type InboxItem } from "./types";

const POLL_MS = 2500;

type Cache = { items: InboxItem[]; serverTime: number };

/**
 * Everything the user has shared. Local-first: the cached list renders instantly,
 * new shares appear before the upload starts, and the server is folded in as it answers.
 */
function useInboxState(user: string) {
  const cacheKey = `verdict.inbox.v1:${user}`;
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const serverTime = useRef(0);
  const flushing = useRef<Promise<void> | null>(null);

  // Restore the cache, then persist every change.
  useEffect(() => {
    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (!raw) return;
        const cache: Cache = JSON.parse(raw);
        serverTime.current = cache.serverTime;
        setItems((current) => mergeLocal(cache.items, current));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [cacheKey]);

  useEffect(() => {
    if (!loaded) return;
    const cache: Cache = { items, serverTime: serverTime.current };
    AsyncStorage.setItem(cacheKey, JSON.stringify(cache)).catch(() => {});
  }, [cacheKey, items, loaded]);

  const merge = useCallback((shares: Parameters<typeof mergeShares>[1]) => {
    setItems((current) => mergeShares(current, shares));
  }, []);

  /** Uploads whatever is waiting in the outbox. Failures stay queued for the next try. */
  const flush = useCallback(() => {
    flushing.current ??= (async () => {
      for (const entry of await readOutbox()) {
        try {
          const { share } = await createShare({
            clientId: entry.clientId,
            text: entry.text ?? undefined,
            imageBase64: await imageBase64(entry),
          });
          await removeFromOutbox(entry.clientId);
          merge([share]);
        } catch {
          // offline or server hiccup: keep it for the next flush
        }
      }
    })().finally(() => (flushing.current = null));
    return flushing.current;
  }, [merge]);

  const sync = useCallback(async () => {
    await flush();
    try {
      const res = await fetchShares(serverTime.current || undefined);
      serverTime.current = res.serverTime;
      merge(res.shares);
    } catch {
      // keep showing the cache
    }
  }, [flush, merge]);

  /** Adds a share. Resolves with `sent: false` when it is safely queued but not uploaded yet. */
  const add = useCallback(
    async ({ text, imageUri }: { text: string | null; imageUri: string | null }) => {
      const clientId = randomUUID();
      const entry = await addToOutbox(clientId, text, imageUri);
      setItems((current) => [
        { clientId, createdAt: Date.now(), pending: true, preview: { text, localImageUri: entry.imagePath }, server: null },
        ...current,
      ]);
      await flush();
      const sent = !(await readOutbox()).some((e) => e.clientId === clientId);
      return { clientId, sent };
    },
    [flush]
  );

  const retry = useCallback(
    async (item: InboxItem, product?: string) => {
      if (!item.server) return flush();
      merge([(await retryShare(item.server.id, product)).share]);
    },
    [flush, merge]
  );

  const remove = useCallback(async (item: InboxItem) => {
    setItems((current) => current.filter((i) => i.clientId !== item.clientId));
    await removeFromOutbox(item.clientId);
    if (item.server) await deleteShare(item.server.id).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  }, [sync]);

  // Sync once the cache is in (so stale cache never lands on fresh data), and on every foreground.
  useEffect(() => {
    if (!loaded) return;
    void sync();
    const sub = AppState.addEventListener("change", (state) => state === "active" && void sync());
    return () => sub.remove();
  }, [loaded, sync]);

  // Poll only while something is still being worked on and the app is visible.
  const anyWorking = items.some(isWorking);
  useEffect(() => {
    if (!anyWorking) return;
    const timer = setInterval(() => AppState.currentState === "active" && void sync(), POLL_MS);
    return () => clearInterval(timer);
  }, [anyWorking, sync]);

  const get = useCallback((idOrClientId: string) => findItem(items, idOrClientId), [items]);

  return { items, loaded, refreshing, add, retry, remove, refresh, get };
}

/** Cached items plus anything added before the cache finished loading. */
function mergeLocal(cached: InboxItem[], added: InboxItem[]): InboxItem[] {
  const fresh = added.filter((a) => !cached.some((c) => c.clientId === a.clientId));
  return [...fresh, ...cached];
}

const InboxContext = createContext<ReturnType<typeof useInboxState> | null>(null);

export function InboxProvider({ user, children }: PropsWithChildren<{ user: string }>) {
  return <InboxContext.Provider value={useInboxState(user)}>{children}</InboxContext.Provider>;
}

export function useInbox() {
  const inbox = useContext(InboxContext);
  if (!inbox) throw new Error("useInbox must be used inside <InboxProvider>");
  return inbox;
}
