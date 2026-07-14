import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { ProductIdentitySchema } from "../schema.js";
import { compareProduct } from "../services/compare.js";
import { normalizeCountry } from "../marketplaces/registry.js";

const BodySchema = z.object({
  product: ProductIdentitySchema.partial({
    brand: true,
    model: true,
    confidence: true,
    searchTerm: true,
  }).extend({
    name: z.string().min(1),
  }),
  gtin: z.string().nullable().optional(),
  country: z.enum(["IN", "US"]).optional(),
});

export async function compareRoute(app: FastifyInstance) {
  app.post(
    "/compare",
    { preHandler: [rejectIfBanned, requireAuth] },
    async (req, reply) => {
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "product.name is required" });
      }
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
      try {
        const result = await compareProduct(product, {
          gtin: parsed.data.gtin ?? null,
          country,
        });
        return {
          offers: result.offers,
          productId: result.productId,
          cached: result.cached,
          country,
        };
      } catch (err) {
        req.log.error(err);
        return reply.code(502).send({ error: (err as Error).message });
      }
    }
  );
}
