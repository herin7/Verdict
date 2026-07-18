import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { findBuyLinks } from "../buylinks.js";
import { requireAuth } from "../auth/plugin.js";
import { normalizeCountry } from "../marketplaces/registry.js";

const BodySchema = z.object({ query: z.string().min(2), country: z.enum(["IN", "US"]).optional() });

export async function buyLinkRoute(app: FastifyInstance) {
  app.post("/buy-link", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "query is required" });
    }
    try {
      const links = await findBuyLinks(parsed.data.query, normalizeCountry(parsed.data.country));
      return { links };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
