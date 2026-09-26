import type { ConsensusReport, ProductIdentity } from "../../types";

export type ShareStatus = "queued" | "identifying" | "researching" | "ready" | "needs_input" | "failed";

/** A share as the server reports it. */
export interface ServerShare {
  id: string;
  clientId: string;
  kind: "image" | "url" | "text";
  status: ShareStatus;
  stage: string | null;
  inputText: string | null;
  inputUrl: string | null;
  imageUrl: string | null;
  product: ProductIdentity | null;
  report: ConsensusReport | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * One row of the inbox. Exists the moment something is shared (even offline),
 * keyed by the clientId generated on the phone; `server` fills in once the
 * API has accepted it.
 */
export interface InboxItem {
  clientId: string;
  createdAt: number;
  /** Not yet accepted by the server (offline or still uploading). */
  pending: boolean;
  /** What was shared, so the row has something to show before the server answers. */
  preview: { text: string | null; localImageUri: string | null };
  server: ServerShare | null;
}

/** What gets uploaded. Kept on disk until the server accepts it. */
export interface OutboxEntry {
  clientId: string;
  text: string | null;
  imagePath: string | null;
}

export const isWorking = (item: InboxItem) =>
  item.pending || !item.server || ["queued", "identifying", "researching"].includes(item.server.status);

/** Best name for a row: the identified product, else what was shared. */
export const itemTitle = (item: InboxItem) =>
  item.server?.product?.name ?? item.preview.text ?? item.server?.inputUrl ?? "Screenshot";
