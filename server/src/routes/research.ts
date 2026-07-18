import type { FastifyInstance } from "fastify";
import { ProductIdentitySchema } from "../schema.js";
import { researchProduct } from "../services/research.js";
import { requireAuth } from "../auth/plugin.js";
import { normalizeCountry } from "../marketplaces/registry.js";

export async function researchRoute(app: FastifyInstance) {
  app.post("/research", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = ProductIdentitySchema.partial({
      brand: true,
      model: true,
      confidence: true,
      searchTerm: true,
    }).safeParse((req.body as any)?.product);
    if (!parsed.success) {
      return reply.code(400).send({ error: "product is required" });
    }
    const product = {
      brand: null,
      model: null,
      confidence: 1,
      searchTerm: parsed.data.name,
      ...parsed.data,
    };
    // The app already sends this (withCountry in api/client.ts) - it was
    // previously dropped here, which is why the report LLM never knew the
    // user's currency and would free-text whatever symbol its (often US)
    // sources used.
    const country = normalizeCountry((req.body as any)?.country);
    const start = Date.now();
    try {
      const result = await researchProduct(product, { userId: req.user?.id, country });
      req.log.info(
        {
          requestId: req.id,
          userId: req.user?.id,
          cache: result.cached ? "hit" : "miss",
          latencyMs: Date.now() - start,
          ok: true,
        },
        "research_outcome"
      );
      return {
        report: result.report,
        buyLinks: result.buyLinks,
        productId: result.productId ?? null,
        cached: result.cached,
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
        "research_outcome"
      );
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
