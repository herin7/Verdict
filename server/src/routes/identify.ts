import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { identifyProduct } from "../claude.js";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { ValidationError, validateProductImage } from "../guard/validation.js";
import { recordViolation } from "../guard/abuse.js";

const BodySchema = z.object({ imageBase64: z.string().min(16) });

export async function identifyRoute(app: FastifyInstance) {
  app.post(
    "/identify",
    { preHandler: [rejectIfBanned, requireAuth] },
    async (req, reply) => {
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "imageBase64 is required" });
      }
      try {
        const raw = await identifyProduct(parsed.data.imageBase64);
        const product = validateProductImage(raw);
        return { product };
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
