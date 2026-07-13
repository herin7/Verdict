import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { ValidationError, validateScreenText } from "../guard/validation.js";
import { recordViolation } from "../guard/abuse.js";
import { callToolIdentifyFromScreenText } from "../identify/llmFallback.js";

const BodySchema = z.object({
  text: z.string().min(1),
  packageName: z.string().min(1).default("unknown"),
});

/**
 * Identifies a product from accessibility-extracted on-screen text (no
 * screenshot, no MediaProjection cast permission). Used by the shopping
 * overlay's auto-detect flow.
 */
export async function identifyScreenRoute(app: FastifyInstance) {
  app.post(
    "/identify-screen",
    { preHandler: [rejectIfBanned, requireAuth] },
    async (req, reply) => {
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "text is required" });
      }
      try {
        const text = validateScreenText(parsed.data.text);
        const product = await callToolIdentifyFromScreenText({
          text,
          packageName: parsed.data.packageName,
        });
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
