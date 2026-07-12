import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { findProductImage } from "../productImage.js";

const BodySchema = z.object({
  product: z.object({
    name: z.string(),
    category: z.string(),
    searchTerm: z.string(),
  }),
});

/** Best-effort real product photo lookup - always resolves (null on miss), never blocks the confirm screen. */
export async function productImageRoute(app: FastifyInstance) {
  app.post("/product-image", async (req, reply) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "product is required" });
    }
    try {
      const imageUrl = await findProductImage(parsed.data.product as any);
      return { imageUrl };
    } catch (err) {
      req.log.error(err);
      return { imageUrl: null };
    }
  });
}
