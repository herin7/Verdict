import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { ValidationError, validateScreenText } from "../guard/validation.js";
import { recordViolation } from "../guard/abuse.js";
import { callToolIdentifyFromScreenText } from "../identify/llmFallback.js";
import { MIN_IDENTIFY_CONFIDENCE } from "../guard/validation.js";
import { cleanScreenText } from "../identify/screenText.js";
import { normalizeCountry } from "../marketplaces/registry.js";

const BodySchema = z.object({
  text: z.string().min(1),
  packageName: z.string().min(1).default("unknown"),
  country: z.enum(["IN", "US"]).optional(),
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
        const country = normalizeCountry(parsed.data.country);
        const raw = validateScreenText(parsed.data.text);
        const { cleaned, asin, priceHint } = cleanScreenText(raw, country);
        req.log.info(
          {
            pkg: parsed.data.packageName,
            country,
            rawLen: raw.length,
            cleanLen: cleaned.length,
            asin,
            preview: cleaned.slice(0, 180),
          },
          "identify-screen input"
        );
        const product = await callToolIdentifyFromScreenText({
          text: cleaned,
          packageName: parsed.data.packageName,
          asin,
          priceHint,
        });
        if (product.confidence < MIN_IDENTIFY_CONFIDENCE) {
          req.log.warn(
            {
              confidence: product.confidence,
              name: product.name,
              searchTerm: product.searchTerm,
            },
            "identify-screen low confidence"
          );
          throw new ValidationError("Could not confidently identify a product on screen", {
            rejectReason: "low_confidence",
            code: "low_confidence",
          });
        }
        return { product, country };
      } catch (err) {
        if (err instanceof ValidationError) {
          if (err.code !== "low_confidence" && err.code !== "text_too_short") {
            const { banned } = await recordViolation(req, err.rejectReason ?? err.code);
            if (banned) {
              return reply.code(403).send({
                error: "Temporarily banned for repeated invalid submissions",
                code: "banned",
              });
            }
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
