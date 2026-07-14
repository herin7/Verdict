import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { ValidationError, validateProductUrl } from "../guard/validation.js";
import { recordViolation } from "../guard/abuse.js";
import { identifyFromUrl } from "../identify/fromUrl.js";
import { currencyFor, normalizeCountry } from "../marketplaces/registry.js";
import { toReferencePrice } from "../marketplaces/normalize.js";

const BodySchema = z.object({
  url: z.string().min(8),
  country: z.enum(["IN", "US"]).optional(),
});

export async function identifyUrlRoute(app: FastifyInstance) {
  app.post(
    "/identify-url",
    { preHandler: [rejectIfBanned, requireAuth] },
    async (req, reply) => {
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "url is required" });
      }
      try {
        const url = validateProductUrl(parsed.data.url);
        const country = normalizeCountry(parsed.data.country);
        const result = await identifyFromUrl(url);
        // The price already on the page the user pasted - authoritative baseline
        // for compare/deals, same as identify-screen's priceHint (see there for
        // why this must never be overridden by a later re-scrape).
        const referencePrice = toReferencePrice(
          result.structured.price,
          result.structured.currency,
          result.marketplaceId,
          currencyFor(country)
        );
        return {
          product: result.product,
          sourceUrl: result.sourceUrl,
          marketplaceId: result.marketplaceId,
          method: result.method,
          structured: result.structured,
          referencePrice,
        };
      } catch (err) {
        if (err instanceof ValidationError) {
          const { banned } = await recordViolation(req, err.rejectReason ?? err.code);
          if (banned) {
            return reply.code(403).send({
              error: "Temporarily banned for repeated invalid submissions",
              code: "banned",
            });
          }
          return reply.code(err.status).send({
            error: err.message,
            code: err.code,
            rejectReason: err.rejectReason,
          });
        }
        req.log.error(err);
        return reply.code(502).send({ error: (err as Error).message });
      }
    }
  );
}
