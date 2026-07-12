import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { ProductIdentitySchema } from "../schema.js";
import { compareProduct } from "../services/compare.js";
import { calculateDeals } from "../deals/calculator.js";
import { PAYMENT_CATALOG, type PaymentMethodId } from "../deals/offers.js";
import { getPaymentProfile } from "../repositories/paymentProfiles.js";

const MethodSchema = z.enum([
  "hdfc_cc",
  "sbi_cc",
  "icici_cc",
  "axis_cc",
  "amex",
  "amazon_pay",
  "flipkart_axis",
  "gpay",
  "phonepe",
  "paytm",
  "cred",
  "amazon_prime",
  "flipkart_plus",
]);

const BodySchema = z.object({
  product: ProductIdentitySchema.partial({
    brand: true,
    model: true,
    confidence: true,
    searchTerm: true,
  }).extend({ name: z.string().min(1) }),
  methods: z.array(MethodSchema).optional(),
  gtin: z.string().nullable().optional(),
});

export async function dealsRoute(app: FastifyInstance) {
  app.get("/deals/catalog", { preHandler: requireAuth }, async () => ({
    methods: PAYMENT_CATALOG,
  }));

  app.post(
    "/deals",
    { preHandler: [rejectIfBanned, requireAuth] },
    async (req, reply) => {
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "product.name is required" });
      }
      const p = parsed.data.product;
      const product = {
        name: p.name,
        brand: p.brand ?? null,
        category: p.category ?? "general",
        model: p.model ?? null,
        confidence: p.confidence ?? 1,
        searchTerm: p.searchTerm ?? p.name,
      };

      let methods: PaymentMethodId[] = (parsed.data.methods as PaymentMethodId[]) ?? [];
      if (methods.length === 0) {
        methods = await getPaymentProfile(req.user!.id).catch(() => [] as PaymentMethodId[]);
      }

      try {
        const compare = await compareProduct(product, { gtin: parsed.data.gtin ?? null });
        const ranked = calculateDeals(compare.offers, methods);
        return {
          deals: ranked,
          productId: compare.productId,
          cached: compare.cached,
          methodsUsed: methods,
        };
      } catch (err) {
        req.log.error(err);
        return reply.code(502).send({ error: (err as Error).message });
      }
    }
  );
}
