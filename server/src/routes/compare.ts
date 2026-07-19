import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { parseProductBody } from "./productBody.js";
import { compareProduct } from "../services/compare.js";
import {
  appendCompareOffer,
  completeCompareJob,
  createCompareJob,
  failCompareJob,
  getCompareJob,
} from "../services/compareJobs.js";
import { MarketplaceOfferSchema } from "../marketplaces/normalize.js";
import { getUserPincode } from "../repositories/paymentProfiles.js";
import { recordScan } from "../repositories/scans.js";

const CompareResponseSchema = z.object({
  offers: z.array(MarketplaceOfferSchema),
  productId: z.string().nullable(),
  cached: z.boolean(),
  country: z.enum(["IN", "US"]),
});
void CompareResponseSchema;

export async function compareRoute(app: FastifyInstance) {
  app.post(
    "/compare",
    { preHandler: [rejectIfBanned, requireAuth] },
    async (req, reply) => {
      const parsed = parseProductBody(req.body);
      if ("error" in parsed) {
        return reply.code(400).send({
          error: parsed.error,
          code: "product_identity_incomplete",
          details: parsed.details,
        });
      }
      const { product, country, gtin, asin, fsn, flipkartItemId, productUrl, location, reference } =
        parsed;
      const start = Date.now();
      try {
        const pincode = parsed.pincode ?? (await getUserPincode(req.user!.id).catch(() => null));
        const result = await compareProduct(product, {
          gtin,
          asin,
          fsn,
          flipkartItemId,
          productUrl,
          country,
          location,
          pincode,
          reference,
        });
        if (result.productId) {
          await recordScan(req.user!.id, result.productId).catch(() => {});
        }
        req.log.info(
          {
            requestId: req.id,
            userId: req.user?.id,
            cache: result.cached ? "hit" : "miss",
            latencyMs: Date.now() - start,
            offerCount: result.offers.length,
            ok: true,
          },
          "compare_outcome"
        );
        return {
          offers: result.offers,
          productId: result.productId,
          cached: result.cached,
          country,
        };
      } catch (err) {
        req.log.error(err);
        req.log.info(
          {
            requestId: req.id,
            userId: req.user?.id,
            latencyMs: Date.now() - start,
            ok: false,
            error: (err as Error).message,
          },
          "compare_outcome"
        );
        return reply.code(502).send({ error: (err as Error).message });
      }
    }
  );

  /**
   * Progressive-results pair: /compare/start kicks off the SAME
   * compareProduct pipeline as /compare but doesn't wait for it - it returns
   * a jobId immediately, and the background run streams each offer into the
   * in-memory job as it resolves (compareJobs.ts) instead of the client
   * blocking on the slowest of up to 8 parallel marketplace scrapes with
   * nothing to show in the meantime. /compare/poll reads the job's current
   * state; the client polls it on an interval until `done`.
   */
  app.post(
    "/compare/start",
    { preHandler: [rejectIfBanned, requireAuth] },
    async (req, reply) => {
      const parsed = parseProductBody(req.body);
      if ("error" in parsed) {
        return reply.code(400).send({
          error: parsed.error,
          code: "product_identity_incomplete",
          details: parsed.details,
        });
      }
      const { product, country, gtin, asin, fsn, flipkartItemId, productUrl, location, reference } =
        parsed;
      const jobId = createCompareJob();
      const userId = req.user!.id;
      const start = Date.now();

      // Deliberately not awaited - the response below returns the jobId
      // right away; this continues running in the background and reports
      // into the job as it goes.
      const pincode = parsed.pincode ?? (await getUserPincode(userId).catch(() => null));
      compareProduct(product, {
        gtin,
        asin,
        fsn,
        flipkartItemId,
        productUrl,
        country,
        location,
        pincode,
        reference,
        onOffer: (offer) => appendCompareOffer(jobId, offer),
      })
        .then(async (result) => {
          if (result.productId) {
            await recordScan(userId, result.productId).catch(() => {});
          }
          completeCompareJob(jobId, result);
          req.log.info(
            {
              requestId: req.id,
              userId,
              cache: result.cached ? "hit" : "miss",
              latencyMs: Date.now() - start,
              offerCount: result.offers.length,
              ok: true,
            },
            "compare_outcome"
          );
        })
        .catch((err) => {
          failCompareJob(jobId, (err as Error).message);
          req.log.error(err);
          req.log.info(
            { requestId: req.id, userId, latencyMs: Date.now() - start, ok: false, error: (err as Error).message },
            "compare_outcome"
          );
        });

      return reply.code(202).send({ jobId, country });
    }
  );

  app.get<{ Params: { jobId: string } }>(
    "/compare/poll/:jobId",
    { preHandler: requireAuth },
    async (req, reply) => {
      const job = getCompareJob(req.params.jobId);
      if (!job) {
        return reply.code(404).send({ error: "Unknown or expired compare job" });
      }
      return {
        offers: job.offers,
        productId: job.productId,
        cached: job.cached,
        done: job.done,
        error: job.error,
      };
    }
  );
}
