import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { dbAvailable } from "../db/client.js";
import { listSaved, saveReport, unsaveReport } from "../repositories/saved.js";
import { countScans, listScans } from "../repositories/scans.js";
import {
  getPaymentProfile,
  getUserPincode,
  savePaymentProfile,
  savePincode,
} from "../repositories/paymentProfiles.js";
import { PAYMENT_CATALOG, type PaymentMethodId } from "../deals/offers.js";
import type { ConsensusReport } from "../schema.js";
import type { BuyLink } from "../buylinks.js";

const ProductIdBody = z.object({ productId: z.string().uuid() });
// methods and pincode are each independently optional - a caller updating
// only the pincode (e.g. ProfileScreen) must never accidentally wipe the
// user's saved payment methods by omitting them, and vice versa.
const PaymentProfileBody = z.object({
  methods: z.array(z.string()).optional(),
  /** 6-digit Indian delivery pincode, or null/omitted to leave unchanged. */
  pincode: z
    .string()
    .regex(/^\d{6}$/)
    .nullable()
    .optional(),
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
    const [methods, pincode] = await Promise.all([
      getPaymentProfile(req.user!.id),
      getUserPincode(req.user!.id),
    ]);
    return { methods, pincode, catalog: PAYMENT_CATALOG };
  });

  app.put("/me/payment-profile", { preHandler: requireAuth }, async (req, reply) => {
    if (!dbAvailable()) return reply.code(503).send({ error: "Database not configured" });
    const parsed = PaymentProfileBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "methods array and/or 6-digit pincode required" });
    }
    if (parsed.data.methods !== undefined) {
      await savePaymentProfile(req.user!.id, parsed.data.methods as PaymentMethodId[]);
    }
    if (parsed.data.pincode !== undefined) {
      await savePincode(req.user!.id, parsed.data.pincode);
    }
    const [methods, pincode] = await Promise.all([
      getPaymentProfile(req.user!.id),
      getUserPincode(req.user!.id),
    ]);
    return { ok: true, methods, pincode };
  });
}
