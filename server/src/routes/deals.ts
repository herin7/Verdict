import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { ProductIdentitySchema } from "../schema.js";
import { compareProduct } from "../services/compare.js";
import { calculateDeals } from "../deals/calculator.js";
import { PAYMENT_CATALOG, type PaymentMethodId } from "../deals/offers.js";
import { getPaymentProfile } from "../repositories/paymentProfiles.js";
import { normalizeCountry } from "../marketplaces/registry.js";

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
  country: z.enum(["IN", "US"]).optional(),
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
      const country = normalizeCountry(parsed.data.country);
      const product = {
        name: p.name,
        brand: p.brand ?? null,
        category: p.category ?? "general",
        model: p.model ?? null,
        confidence: p.confidence ?? 1,
        searchTerm: p.searchTerm ?? p.name,
      };

      let methods: PaymentMethodId[] = (parsed.data.methods as PaymentMethodId[]) ?? [];
      if (country === "US") {
        methods = [];
      } else if (methods.length === 0) {
        methods = await getPaymentProfile(req.user!.id).catch(() => [] as PaymentMethodId[]);
      }

      const start = Date.now();
      try {
        const compare = await compareProduct(product, {
          gtin: parsed.data.gtin ?? null,
          country,
        });
        const ranked = country === "US" ? [] : calculateDeals(compare.offers, methods);
        req.log.info(
          {
            requestId: req.id,
            userId: req.user?.id,
            cache: compare.cached ? "hit" : "miss",
            latencyMs: Date.now() - start,
            dealCount: ranked.length,
            ok: true,
          },
          "deals_outcome"
        );
        return {
          deals: ranked,
          offers: compare.offers,
          productId: compare.productId,
          cached: compare.cached,
          methodsUsed: methods,
          country,
        };
      } catch (err) {
        req.log.error(err);
        req.log.info(
          {
            requestId: req.id,
            userId: req.user?.id,
            latencyMs: Date.now() - start,
            ok: false,
            error: (err as Error).message,
          },
          "deals_outcome"
        );
        return reply.code(502).send({ error: (err as Error).message });
      }
    }
  );
}
