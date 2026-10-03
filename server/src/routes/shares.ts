import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { ConsensusReportSchema } from "../schema.js";
import { createShare, deleteShare, getShareForUser, listShares, reportsFor, updateShare, type ShareRow } from "../shares/repository.js";
import { imageKeyFor, imageUrl, putImage } from "../shares/storage.js";
import { dispatchShare } from "../shares/dispatch.js";
import { contentHash } from "../shares/process.js";
import { registerDevice } from "../shares/notify.js";
import { extractProductUrl } from "../utils/productUrl.js";

const CreateBody = z
  .object({
    clientId: z.string().min(8).max(64),
    text: z.string().max(4000).optional(),
    /** JPEG, base64. The app resizes screenshots to ~1280px first. */
    imageBase64: z.string().max(6_000_000).optional(),
  })
  .refine((b) => b.text?.trim() || b.imageBase64, "Share an image, a link or some text.");

/** API shape of a share: the row plus its verdict when ready. */
async function present(rows: ShareRow[]) {
  const reports = await reportsFor(rows.filter((r) => r.status === "ready" && r.productId).map((r) => r.productId!));
  return Promise.all(
    rows.map(async (r) => {
      const parsed = r.productId ? ConsensusReportSchema.safeParse(reports.get(r.productId)) : null;
      return {
        id: r.id,
        clientId: r.clientId,
        kind: r.kind,
        status: r.status,
        stage: r.stage,
        inputText: r.inputText,
        inputUrl: r.inputUrl,
        imageUrl: r.imageKey ? await imageUrl(r.imageKey).catch(() => null) : null,
        product: r.product,
        report: parsed?.success ? parsed.data : null,
        personal: r.personal,
        error: r.error,
        createdAt: r.createdAt.getTime(),
        updatedAt: r.updatedAt.getTime(),
      };
    })
  );
}

export async function sharesRoute(app: FastifyInstance) {
  /** Accept a share and acknowledge immediately; the work happens in the background. */
  app.post("/shares", { preHandler: requireAuth, bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid share" });
    const { clientId, text, imageBase64 } = parsed.data;
    const userId = req.user!.id;
    // Per-step latency, logged once as share_accepted so slow steps show up in CloudWatch.
    const timings: Record<string, number> = {};
    const timed = async <T>(step: string, fn: () => Promise<T>): Promise<T> => {
      const t0 = performance.now();
      try {
        return await fn();
      } finally {
        timings[`${step}Ms`] = Math.round(performance.now() - t0);
      }
    };

    const image = imageBase64 ? Buffer.from(imageBase64, "base64") : null;
    const url = extractProductUrl(text);
    const kind = image ? "image" : url ? "url" : "text";
    const imageKey = image ? imageKeyFor(userId, clientId) : null;
    if (image && imageKey) await timed("s3Put", () => putImage(imageKey, image));

    const { share, created } = await timed("db", () => createShare({
      userId,
      clientId,
      kind,
      contentHash: contentHash([kind, image, url ?? text?.trim().toLowerCase()]),
      inputText: text?.trim() || null,
      inputUrl: url,
      imageKey,
    }));
    if (created) await timed("dispatch", () => dispatchShare(share.id));
    const body = await timed("present", () => present([share]));
    req.log.info({ requestId: req.id, shareId: share.id, kind, created, ...timings }, "share_accepted");
    return reply.code(created ? 201 : 200).send({ share: body[0] });
  });

  /** The inbox. `?since=<ms>` returns only what changed - the app polls this while items are working. */
  app.get("/shares", { preHandler: requireAuth }, async (req) => {
    const since = Number((req.query as { since?: string }).since);
    const rows = await listShares(req.user!.id, Number.isFinite(since) && since > 0 ? new Date(since) : undefined);
    return { shares: await present(rows), serverTime: Date.now() };
  });

  app.get("/shares/:id", { preHandler: requireAuth }, async (req, reply) => {
    const row = await getShareForUser(req.user!.id, (req.params as { id: string }).id);
    if (!row) return reply.code(404).send({ error: "Not found" });
    return { share: (await present([row]))[0] };
  });

  /** Try again after a failure, or after the user told us which product it is. */
  app.post("/shares/:id/retry", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ product: z.string().trim().min(2).max(200).optional() }).safeParse(req.body ?? {});
    const row = await getShareForUser(req.user!.id, (req.params as { id: string }).id);
    if (!row || !body.success) return reply.code(404).send({ error: "Not found" });
    if (row.status !== "failed" && row.status !== "needs_input") return { share: (await present([row]))[0] };

    await updateShare(row.id, {
      status: "queued",
      stage: null,
      error: null,
      attempts: 0,
      personal: null,
      // A typed product name replaces whatever we failed to read.
      ...(body.data.product ? { product: null, extractedText: body.data.product, inputText: body.data.product } : {}),
    });
    await dispatchShare(row.id);
    return { share: (await present([(await getShareForUser(req.user!.id, row.id))!]))[0] };
  });

  app.delete("/shares/:id", { preHandler: requireAuth }, async (req) => {
    await deleteShare(req.user!.id, (req.params as { id: string }).id);
    return { ok: true };
  });

  app.post("/devices", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ expoToken: z.string().min(10), platform: z.string().max(16).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "expoToken is required" });
    await registerDevice(req.user!.id, body.data.expoToken, body.data.platform ?? null);
    return { ok: true };
  });
}
