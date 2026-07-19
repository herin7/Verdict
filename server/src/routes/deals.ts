import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { ProductIdentitySchema } from "../schema.js";
import { compareProduct } from "../services/compare.js";
import { calculateDeals } from "../deals/calculator.js";
import { PAYMENT_CATALOG, type PaymentMethodId } from "../deals/offers.js";
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
    product: ProductIdentitySchema.partial({
      brand: true,
      model: true,
      confidence: true,
      searchTerm: true,
    }).extend({
      name: z.string().trim().min(1).max(200),
      brand: z.string().trim().max(80).nullable().optional(),
      model: z.string().trim().max(80).nullable().optional(),
      category: z.string().trim().max(40).optional(),
      searchTerm: z.string().trim().max(200).optional(),
    }),
    methods: z.array(MethodSchema).optional(),
    gtin: z
      .string()
      .regex(/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/)
      .nullable()
      .optional(),
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

const DealsResponseSchema = z.object({
  deals: z.array(z.unknown()),
  offers: z.array(MarketplaceOfferSchema),
  productId: z.string().nullable(),
  cached: z.boolean(),
  methodsUsed: z.array(MethodSchema),
  country: z.enum(["IN", "US"]),
});
void DealsResponseSchema;

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
        const reference = parsed.data.reference ?? null;
        const pincode = parsed.data.pincode ?? (await getUserPincode(req.user!.id).catch(() => null));
        const compare = await compareProduct(product, {
          gtin: parsed.data.gtin ?? null,
          country,
          location: parsed.data.location ?? null,
          pincode,
          reference,
        });
        const ranked = country === "US" ? [] : calculateDeals(compare.offers, methods, { reference });
        if (compare.productId) {
          await recordScan(req.user!.id, compare.productId).catch(() => {});
        }
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
