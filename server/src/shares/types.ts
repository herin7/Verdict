export type ShareKind = "image" | "url" | "text";

/**
 * queued      → accepted, waiting for the worker
 * identifying → reading the screenshot/link/text and working out the product
 * researching → product known, gathering evidence and writing the verdict
 * ready       → verdict available
 * needs_input → we couldn't tell which product it is; the user can type it
 * failed      → gave up after retries; the user can retry
 */
export type ShareStatus = "queued" | "identifying" | "researching" | "ready" | "needs_input" | "failed";

/** Progress copy the app shows while a share is being worked on. */
export const STAGE = {
  reading: "Reading what you shared",
  identifying: "Working out the product",
  searching: "Finding reviews and owner reports",
  reading_sources: "Reading what owners say",
  writing: "Writing your verdict",
} as const;
