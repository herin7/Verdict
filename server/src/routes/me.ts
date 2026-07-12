import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { dbAvailable } from "../db/client.js";
import { listSaved, saveReport, unsaveReport } from "../repositories/saved.js";
import { countScans, listScans } from "../repositories/scans.js";
import { getPaymentProfile, savePaymentProfile } from "../repositories/paymentProfiles.js";
import { PAYMENT_CATALOG, type PaymentMethodId } from "../deals/offers.js";
import type { ConsensusReport } from "../schema.js";
import type { BuyLink } from "../buylinks.js";

const ProductIdBody = z.object({ productId: z.string().uuid() });
const PaymentProfileBody = z.object({
  methods: z.array(z.string()),
});

export async function meRoute(app: FastifyInstance) {
  app.get("/me/saved", { preHandler: requireAuth }, async (req, reply) => {
    if (!dbAvailable()) return reply.code(503).send({ error: "Database not configured" });
    const userId = req.user!.id;
    const rows = await listSaved(userId);
    const items = rows.map((r) => ({
      id: r.id,
      savedAt: r.savedAt.getTime(),
      productId: r.productId,
      product: {
        name: r.name,
        brand: r.brand,
        category: r.category,
        model: r.model,
        searchTerm: r.searchTerm,
        confidence: 1,
      },
      report: r.report as ConsensusReport | null,
      buyLinks: (r.links as BuyLink[] | null) ?? [],
      imageUrl: r.imageUrl,
    }));
    return { items };
  });

  app.post("/me/saved", { preHandler: requireAuth }, async (req, reply) => {
    if (!dbAvailable()) return reply.code(503).send({ error: "Database not configured" });
    const parsed = ProductIdBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "productId is required" });
    await saveReport(req.user!.id, parsed.data.productId);
    return { ok: true };
  });

  app.delete("/me/saved/:productId", { preHandler: requireAuth }, async (req, reply) => {
    if (!dbAvailable()) return reply.code(503).send({ error: "Database not configured" });
    const productId = (req.params as { productId: string }).productId;
    if (!productId) return reply.code(400).send({ error: "productId is required" });
    await unsaveReport(req.user!.id, productId);
    return { ok: true };
  });

  app.get("/me/scans", { preHandler: requireAuth }, async (req, reply) => {
    if (!dbAvailable()) return reply.code(503).send({ error: "Database not configured" });
    const userId = req.user!.id;
    const [items, count] = await Promise.all([listScans(userId), countScans(userId)]);
    return {
      count,
      items: items.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.getTime(),
        productId: r.productId,
        product: {
          name: r.name,
          brand: r.brand,
          category: r.category,
          model: r.model,
          searchTerm: r.searchTerm,
          confidence: 1,
        },
        imageUrl: r.imageUrl,
      })),
    };
  });

  app.get("/me/payment-profile", { preHandler: requireAuth }, async (req, reply) => {
    if (!dbAvailable()) return reply.code(503).send({ error: "Database not configured" });
    const methods = await getPaymentProfile(req.user!.id);
    return { methods, catalog: PAYMENT_CATALOG };
  });

  app.put("/me/payment-profile", { preHandler: requireAuth }, async (req, reply) => {
    if (!dbAvailable()) return reply.code(503).send({ error: "Database not configured" });
    const parsed = PaymentProfileBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "methods array required" });
    await savePaymentProfile(req.user!.id, parsed.data.methods as PaymentMethodId[]);
    return { ok: true, methods: parsed.data.methods };
  });
}
