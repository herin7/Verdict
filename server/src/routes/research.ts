import type { FastifyInstance } from "fastify";
import { ProductIdentitySchema } from "../schema.js";
import { runResearch } from "../pipeline.js";

export async function researchRoute(app: FastifyInstance) {
  app.post("/research", async (req, reply) => {
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
      const report = await runResearch(product);
      return { report };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
