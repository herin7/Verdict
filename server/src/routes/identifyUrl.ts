import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { ValidationError, validateProductUrl } from "../guard/validation.js";
import { recordViolation } from "../guard/abuse.js";
import { identifyFromUrl } from "../identify/fromUrl.js";

const BodySchema = z.object({ url: z.string().min(8) });

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
        const result = await identifyFromUrl(url);
        return {
          product: result.product,
          sourceUrl: result.sourceUrl,
          marketplaceId: result.marketplaceId,
          method: result.method,
          structured: result.structured,
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
