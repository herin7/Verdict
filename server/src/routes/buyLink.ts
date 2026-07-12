import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { findBuyLinks } from "../buylinks.js";

const BodySchema = z.object({ query: z.string().min(2) });

/** On-demand purchase-link lookup, used for alternatives the user wants to price-check. */
export async function buyLinkRoute(app: FastifyInstance) {
  app.post("/buy-link", async (req, reply) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "query is required" });
    }
    try {
      const links = await findBuyLinks(parsed.data.query);
      return { links };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
