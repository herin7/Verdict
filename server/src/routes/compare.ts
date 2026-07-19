import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { ProductIdentitySchema } from "../schema.js";
import { compareProduct } from "../services/compare.js";
import {
  appendCompareOffer,
  completeCompareJob,
  createCompareJob,
  failCompareJob,
  getCompareJob,
} from "../services/compareJobs.js";
import { currencyFor, normalizeCountry } from "../marketplaces/registry.js";
import { ReferencePriceSchema, MarketplaceOfferSchema } from "../marketplaces/normalize.js";
import { getUserPincode } from "../repositories/paymentProfiles.js";
import { recordScan } from "../repositories/scans.js";

const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const GtinSchema = z
  .string()
  .regex(/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/)
  .nullable()
  .optional();

const BodySchema = z
  .object({
    product: ProductIdentitySchema.partial({
      brand: true,
      model: true,
      confidence: true,
      searchTerm: true,
    }).extend({
      name: z.string().trim().min(1).max(200),
      brand: z.string().trim().max(80).nullable().optional(),
      model: z.string().trim().max(80).nullable().optional(),
      category: z.string().trim().max(40).optional(),
      searchTerm: z.string().trim().max(200).optional(),
    }),
    gtin: GtinSchema,
    country: z.enum(["IN", "US"]).optional(),
    location: LocationSchema.optional(),
    pincode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    reference: ReferencePriceSchema.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.reference) return;
    const country = normalizeCountry(data.country);
    const expected = currencyFor(country);
    if (data.reference.currency !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `reference.currency must be ${expected} for country ${country}`,
        path: ["reference", "currency"],
      });
    }
  });

const CompareResponseSchema = z.object({
  offers: z.array(MarketplaceOfferSchema),
  productId: z.string().nullable(),
  cached: z.boolean(),
  country: z.enum(["IN", "US"]),
});
void CompareResponseSchema;

/** Shared body parsing + pincode fallback for both /compare and /compare/start. */
async function parseCompareRequest(body: unknown, userId: string) {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return null;
  const p = parsed.data.product;
  const country = normalizeCountry(parsed.data.country);
  const product = {
    name: p.name,
    brand: p.brand ?? null,
    category: p.category ?? "general",
    model: p.model ?? null,
    confidence: p.confidence ?? 1,
    searchTerm: p.searchTerm ?? p.name,
  };
  const pincode = parsed.data.pincode ?? (await getUserPincode(userId).catch(() => null));
  return {
    product,
    country,
    gtin: parsed.data.gtin ?? null,
    location: parsed.data.location ?? null,
    pincode,
    reference: parsed.data.reference ?? null,
  };
}

export async function compareRoute(app: FastifyInstance) {
  app.post(
    "/compare",
    { preHandler: [rejectIfBanned, requireAuth] },
    async (req, reply) => {
      const parsed = await parseCompareRequest(req.body, req.user!.id);
      if (!parsed) {
        return reply.code(400).send({ error: "product.name is required" });
      }
      const { product, country, gtin, location, pincode, reference } = parsed;
      const start = Date.now();
      try {
        const result = await compareProduct(product, { gtin, country, location, pincode, reference });
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
      const parsed = await parseCompareRequest(req.body, req.user!.id);
      if (!parsed) {
        return reply.code(400).send({ error: "product.name is required" });
      }
      const { product, country, gtin, location, pincode, reference } = parsed;
      const jobId = createCompareJob();
      const userId = req.user!.id;
      const start = Date.now();

      // Deliberately not awaited - the response below returns the jobId
      // right away; this continues running in the background and reports
      // into the job as it goes.
      compareProduct(product, {
        gtin,
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
    async (req, reply: FastifyReply) => {
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
