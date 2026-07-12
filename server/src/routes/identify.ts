import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { identifyProduct } from "../claude.js";

const BodySchema = z.object({ imageBase64: z.string().min(16) });

export async function identifyRoute(app: FastifyInstance) {
  app.post("/identify", async (req, reply) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "imageBase64 is required" });
    }
    try {
      const product = await identifyProduct(parsed.data.imageBase64);
      return { product };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
