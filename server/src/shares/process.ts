import { createHash } from "node:crypto";
import { logger } from "../logging/logger.js";
import { identifyFromUrl, isJunkProductName } from "../identify/fromUrl.js";
import { callToolIdentifyFromQuery, callToolIdentifyFromScreenshot } from "../identify/llmFallback.js";
import { researchProduct } from "../services/research.js";
import { normalizeCountry } from "../marketplaces/registry.js";
import type { ProductIdentity } from "../schema.js";
import { getShare, updateShare, type ShareRow } from "./repository.js";
import { getImage } from "./storage.js";
import { readText } from "./ocr.js";
import { notifyUser } from "./notify.js";
import { STAGE } from "./types.js";

/** Below this, we ask the user which product they meant instead of guessing. */
const MIN_CONFIDENCE = 0.55;
/** Lambda retries a failed async invoke twice, so the 3rd attempt is the last. */
const MAX_ATTEMPTS = 3;

/** An error the user can fix (e.g. by telling us the product). Not retried. */
class NeedsInput extends Error {}

/**
 * Runs one share to completion. Safe to call again for the same share: each
 * step looks at what's already stored and skips work that's done, so a retry
 * after a crash continues instead of starting over.
 *
 *   queued → identifying → researching → ready
 *                 ↘ needs_input              ↘ failed (after MAX_ATTEMPTS)
 */
export async function processShare(shareId: string): Promise<void> {
  const share = await getShare(shareId);
  if (!share || share.status === "ready" || share.status === "needs_input") return;

  const attempt = share.attempts + 1;
  const log = logger.child({ shareId, userId: share.userId, attempt });
  const timings: Record<string, number> = { ...(share.timings as Record<string, number>) };
  const timed = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      timings[name] = Date.now() - start;
      log.info({ step: name, ms: timings[name] }, "share_step");
    }
  };
  const started = Date.now();
  await updateShare(shareId, { attempts: attempt, error: null });

  try {
    // 1. Identify (skipped when a previous attempt already found the product)
    let product = share.product as ProductIdentity | null;
    if (!product) {
      await updateShare(shareId, { status: "identifying", stage: STAGE.reading });
      product = await timed("identify", () => identify(share, shareId));
      await updateShare(shareId, { product, stage: STAGE.searching, status: "researching" });
    }

    // 2. Research (cached reports and in-flight runs are reused inside)
    await updateShare(shareId, { status: "researching", stage: STAGE.searching });
    const outcome = await timed("research", () =>
      researchProduct(product!, {
        country: normalizeCountry("IN"),
        onStep: (step) => updateShare(shareId, { stage: STAGE[step] }),
      })
    );
    timings.total = Date.now() - started;
    await updateShare(shareId, { status: "ready", stage: null, productId: outcome.productId, timings });
    log.info({ cached: outcome.cached, totalMs: timings.total, verdict: outcome.report.verdict }, "share_ready");

    // 3. Notify (never fails the share)
    const sent = await notifyUser(share.userId, {
      title: `Verdict is ready: ${product.name}`,
      body: `${outcome.report.verdict.toUpperCase()} · ${outcome.report.verdictLine}`,
      url: `verdict://item/${shareId}`,
    });
    if (sent > 0) await updateShare(shareId, { notifiedAt: new Date() });
  } catch (err) {
    const message = (err as Error).message || "Something went wrong";
    if (err instanceof NeedsInput) {
      await updateShare(shareId, { status: "needs_input", stage: null, error: message, timings });
      log.info({ reason: message }, "share_needs_input");
      return;
    }
    const final = attempt >= MAX_ATTEMPTS;
    await updateShare(shareId, { status: final ? "failed" : "queued", stage: final ? null : "Retrying…", error: message, timings });
    log.error({ err, final }, "share_failed");
    if (!final) throw err; // let Lambda retry the async invoke
  }
}

/** Screenshot → OCR text, link → page, text → itself; then text → product. */
async function identify(share: ShareRow, shareId: string): Promise<ProductIdentity> {
  if (share.kind === "url" && share.inputUrl) {
    const result = await identifyFromUrl(share.inputUrl).catch(() => null);
    if (result && result.product.confidence >= MIN_CONFIDENCE && !isJunkProductName(result.product.name)) return result.product;
    // Unreadable page: fall through to whatever text came with the link.
  }

  let text = share.extractedText ?? share.inputText ?? "";
  if (share.kind === "image" && share.imageKey && !share.extractedText) {
    text = await readText(await getImage(share.imageKey));
    await updateShare(shareId, { extractedText: text, stage: STAGE.identifying });
  }
  if (text.trim().length < 3) throw new NeedsInput("We couldn't read any product name in that.");

  const product =
    share.kind === "image" ? await callToolIdentifyFromScreenshot(text) : await callToolIdentifyFromQuery(text.slice(0, 200));
  if (product.confidence < MIN_CONFIDENCE || isJunkProductName(product.name)) {
    throw new NeedsInput("We couldn't tell which product this is.");
  }
  return product;
}

/** Stable fingerprint of what was shared, for duplicate detection. */
export function contentHash(parts: (string | Buffer | null | undefined)[]): string {
  const hash = createHash("sha256");
  for (const p of parts) if (p) hash.update(p);
  return hash.digest("hex");
}
