import type { InboxItem, ServerShare } from "./types";

const newestFirst = (a: InboxItem, b: InboxItem) => b.createdAt - a.createdAt;

/**
 * Folds server rows into the local list, matched by clientId. Rows only this
 * device hasn't seen (shared from another device, or a reinstall) are added.
 * An older copy of a row never overwrites a newer one.
 */
export function mergeShares(items: InboxItem[], shares: ServerShare[]): InboxItem[] {
  const byClientId = new Map(items.map((item) => [item.clientId, item]));
  for (const share of shares) {
    const existing = byClientId.get(share.clientId);
    if (existing?.server && existing.server.updatedAt > share.updatedAt) continue;
    byClientId.set(share.clientId, {
      clientId: share.clientId,
      createdAt: existing?.createdAt ?? share.createdAt,
      pending: false,
      preview: existing?.preview ?? { text: share.inputText ?? share.inputUrl, localImageUri: null },
      server: share,
    });
  }
  return [...byClientId.values()].sort(newestFirst);
}

/** Routes use the server id once known, the clientId before that; accept either. */
export function findItem(items: InboxItem[], idOrClientId: string): InboxItem | undefined {
  return items.find((item) => item.clientId === idOrClientId || item.server?.id === idOrClientId);
}
