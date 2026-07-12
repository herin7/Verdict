import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ProductIdentitySchema } from "../schema.js";
import { AnakinCreditError } from "../anakin.js";
import {
  getLongTermScore,
  getVersionHistory,
  getScamDetector,
  getBestInCategory,
  type InsightType,
} from "../insights.js";
import type { ProductIdentity } from "../schema.js";

const InsightTypeSchema = z.enum(["long-term", "version-history", "scam-detector", "best-in-category"]);

const BodySchema = z.object({
  type: InsightTypeSchema,
  product: ProductIdentitySchema.partial({
    brand: true,
    model: true,
    confidence: true,
    searchTerm: true,
  }),
});

const HANDLERS: Record<InsightType, (product: ProductIdentity) => Promise<unknown>> = {
  "long-term": getLongTermScore,
  "version-history": getVersionHistory,
  "scam-detector": getScamDetector,
  "best-in-category": getBestInCategory,
};

/** Lazily-fetched deep-dive insights - independent of the main report so a slow/failed one never blocks it. */
export async function insightsRoute(app: FastifyInstance) {
  app.post("/insights", async (req, reply) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "type and product are required" });
    }
    const { type, product: partial } = parsed.data;
    const product = {
      brand: null,
      model: null,
      confidence: 1,
      searchTerm: partial.name,
      ...partial,
    };

    try {
      const insight = await HANDLERS[type](product);
      return { type, insight };
    } catch (err) {
      req.log.error(err);
      if (err instanceof AnakinCreditError) {
        return reply.code(402).send({ error: err.message, code: "out_of_credits" });
      }
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
