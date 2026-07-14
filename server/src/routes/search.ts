import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { compareProduct } from "../services/compare.js";
import { calculateDeals } from "../deals/calculator.js";
import type { PaymentMethodId } from "../deals/offers.js";
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
  query: z.string().trim().min(2).max(200),
  category: z.string().trim().max(40).optional(),
  methods: z.array(MethodSchema).optional(),
  country: z.enum(["IN", "US"]).optional(),
  location: z.object({ lat: z.number(), lon: z.number() }).optional(),
  /** Optional live reference price, e.g. when Direct Search is used to
   *  cross-check a product the user is already viewing elsewhere. */
  reference: z
    .object({
      amount: z.number().positive(),
      currency: z.string().min(1),
      retailerId: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

/**
 * Direct/manual search: skips the screenshot -> identify step entirely and treats
 * the free-text query as the product name/search term, then reuses the same
 * compare + deals pipeline as the scan flow. Additive - the existing /compare and
 * /deals contracts (product-object input) are untouched.
 */
export async function searchRoute(app: FastifyInstance) {
  app.post(
    "/search",
    { preHandler: [rejectIfBanned, requireAuth] },
    async (req, reply) => {
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "query is required (min 2 characters)" });
      }
      const country = normalizeCountry(parsed.data.country);
      const query = parsed.data.query.trim();
      const product = {
        name: query,
        brand: null,
        category: parsed.data.category?.trim() || "general",
        model: null,
        confidence: 1,
        searchTerm: query,
      };

      let methods: PaymentMethodId[] = (parsed.data.methods as PaymentMethodId[]) ?? [];
      if (country === "US") {
        methods = [];
      } else if (methods.length === 0) {
        methods = await getPaymentProfile(req.user!.id).catch(() => [] as PaymentMethodId[]);
      }

      const start = Date.now();
      try {
        const reference = parsed.data.reference ?? null;
        const compare = await compareProduct(product, {
          country,
          location: parsed.data.location ?? null,
          reference,
        });
        const ranked = country === "US" ? [] : calculateDeals(compare.offers, methods, { reference });
        req.log.info(
          {
            requestId: req.id,
            userId: req.user?.id,
            cache: compare.cached ? "hit" : "miss",
            latencyMs: Date.now() - start,
            offerCount: compare.offers.length,
            dealCount: ranked.length,
            ok: true,
          },
          "search_outcome"
        );
        return {
          product,
          offers: compare.offers,
          deals: ranked,
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
          "search_outcome"
        );
        return reply.code(502).send({ error: (err as Error).message });
      }
    }
  );
}
