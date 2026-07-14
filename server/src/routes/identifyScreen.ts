import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { ValidationError, validateScreenText } from "../guard/validation.js";
import { recordViolation } from "../guard/abuse.js";
import { callToolIdentifyFromScreenText } from "../identify/llmFallback.js";
import { MIN_IDENTIFY_CONFIDENCE } from "../guard/validation.js";
import { cleanScreenText } from "../identify/screenText.js";
import { currencyFor, marketplaceIdForPackage, normalizeCountry } from "../marketplaces/registry.js";
import { toReferencePrice } from "../marketplaces/normalize.js";

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
      const start = Date.now();
      try {
        const country = normalizeCountry(parsed.data.country);
        const raw = validateScreenText(parsed.data.text);
        const { cleaned, asin, priceHint, hasBuyBox, hasBreadcrumb } = cleanScreenText(raw, country);
        req.log.info(
          {
            requestId: req.id,
            pkg: parsed.data.packageName,
            country,
            rawLen: raw.length,
            cleanLen: cleaned.length,
            hasAsin: Boolean(asin),
            hasPriceHint: Boolean(priceHint),
            hasBuyBox,
            hasBreadcrumb,
          },
          "identify-screen input"
        );
        const product = await callToolIdentifyFromScreenText({
          text: cleaned,
          packageName: parsed.data.packageName,
          asin,
          priceHint,
          hasBuyBox,
          hasBreadcrumb,
        });
        if (product.confidence < MIN_IDENTIFY_CONFIDENCE) {
          req.log.warn(
            {
              requestId: req.id,
              confidence: product.confidence,
              category: product.category ?? null,
              hasName: Boolean(product.name),
              hasSearchTerm: Boolean(product.searchTerm),
            },
            "identify-screen low confidence"
          );
          throw new ValidationError("Could not confidently identify a product on screen", {
            rejectReason: "low_confidence",
            code: "low_confidence",
          });
        }
        req.log.info(
          { requestId: req.id, userId: req.user?.id, latencyMs: Date.now() - start, ok: true },
          "identify_screen_outcome"
        );
        // The price already visible on the user's screen right now - the
        // authoritative baseline for compare/deals, never to be overridden by a
        // later re-scrape of the same platform. sourceMarketplaceId (best-effort,
        // from the app's package name) lets compare/deals recognize when a
        // re-scraped "competing" offer is actually the same listing.
        const sourceMarketplaceId = marketplaceIdForPackage(parsed.data.packageName, country);
        const referencePrice = toReferencePrice(priceHint, null, sourceMarketplaceId, currencyFor(country));
        return { product, country, referencePrice };
      } catch (err) {
        if (err instanceof ValidationError) {
          req.log.info(
            {
              requestId: req.id,
              userId: req.user?.id,
              latencyMs: Date.now() - start,
              ok: false,
              error: err.code,
            },
            "identify_screen_outcome"
          );
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
        req.log.info(
          {
            requestId: req.id,
            userId: req.user?.id,
            latencyMs: Date.now() - start,
            ok: false,
            error: (err as Error).message,
          },
          "identify_screen_outcome"
        );
        return reply.code(502).send({ error: (err as Error).message });
      }
    }
  );
}
