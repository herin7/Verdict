import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { compareProduct } from "../services/compare.js";
import { calculateDeals } from "../deals/calculator.js";
import type { PaymentMethodId } from "../deals/offers.js";
import { getPaymentProfile, getUserPincode } from "../repositories/paymentProfiles.js";
import { recordScan } from "../repositories/scans.js";
import { currencyFor, normalizeCountry } from "../marketplaces/registry.js";
import { MarketplaceOfferSchema, ReferencePriceSchema } from "../marketplaces/normalize.js";

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

const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const BodySchema = z
  .object({
    query: z.string().trim().min(2).max(200),
    category: z.string().trim().max(40).optional(),
    methods: z.array(MethodSchema).optional(),
    country: z.enum(["IN", "US"]).optional(),
    location: LocationSchema.optional(),
    pincode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    reference: ReferencePriceSchema.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.reference) return;
    const country = normalizeCountry(data.country);
    const expected = currencyFor(country);
    if (data.reference.currency !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `reference.currency must be ${expected} for country ${country}`,
        path: ["reference", "currency"],
      });
    }
  });

const SearchResponseSchema = z.object({
  product: z.object({
    name: z.string(),
    brand: z.string().nullable(),
    category: z.string(),
    model: z.string().nullable(),
    confidence: z.number(),
    searchTerm: z.string(),
  }),
  offers: z.array(MarketplaceOfferSchema),
  deals: z.array(z.unknown()),
  productId: z.string().nullable(),
  cached: z.boolean(),
  methodsUsed: z.array(MethodSchema),
  country: z.enum(["IN", "US"]),
});
void SearchResponseSchema;

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
        const pincode = parsed.data.pincode ?? (await getUserPincode(req.user!.id).catch(() => null));
        const compare = await compareProduct(product, {
          country,
          location: parsed.data.location ?? null,
          pincode,
          reference,
        });
        const ranked = country === "US" ? [] : calculateDeals(compare.offers, methods, { reference });
        // Direct Search never calls /research, so without this the user's
        // activity here was completely invisible to /me/scans - a real
        // product lookup that left no trace.
        if (compare.productId) {
          await recordScan(req.user!.id, compare.productId).catch(() => {});
        }
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
