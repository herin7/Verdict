import type { FastifyInstance } from "fastify";
import { ProductIdentitySchema } from "../schema.js";
import { researchProduct } from "../services/research.js";
import { AnakinCreditError } from "../anakin.js";
import { requireAuth } from "../auth/plugin.js";

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
    try {
      const result = await researchProduct(product, { userId: req.user?.id });
      return {
        report: result.report,
        buyLinks: result.buyLinks,
        productId: result.productId ?? null,
        cached: result.cached,
      };
    } catch (err) {
      req.log.error(err);
      if (err instanceof AnakinCreditError) {
        return reply.code(402).send({ error: err.message, code: "out_of_credits" });
      }
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
