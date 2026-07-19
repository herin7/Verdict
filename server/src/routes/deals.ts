import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { parseProductBody } from "./productBody.js";
import { compareProduct } from "../services/compare.js";
import { calculateDeals } from "../deals/calculator.js";
import { PAYMENT_CATALOG, type PaymentMethodId } from "../deals/offers.js";
import { getPaymentProfile, getUserPincode } from "../repositories/paymentProfiles.js";
import { recordScan } from "../repositories/scans.js";
import { MarketplaceOfferSchema } from "../marketplaces/normalize.js";

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
      const parsed = parseProductBody(req.body);
      if ("error" in parsed) {
        return reply.code(400).send({
          error: parsed.error,
          code: "product_identity_incomplete",
          details: parsed.details,
        });
      }
      const { product, country, gtin, asin, fsn, flipkartItemId, productUrl, location, reference } =
        parsed;

      let methods: PaymentMethodId[] = [];
      const rawMethods = parsed.methods;
      if (Array.isArray(rawMethods)) {
        const checked = z.array(MethodSchema).safeParse(rawMethods);
        if (checked.success) methods = checked.data as PaymentMethodId[];
      }
      if (country === "US") {
        methods = [];
      } else if (methods.length === 0) {
        methods = await getPaymentProfile(req.user!.id).catch(() => [] as PaymentMethodId[]);
      }

      const start = Date.now();
      try {
        const pincode = parsed.pincode ?? (await getUserPincode(req.user!.id).catch(() => null));
        const compare = await compareProduct(product, {
          gtin,
          asin,
          fsn,
          flipkartItemId,
          productUrl,
          country,
          location,
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
