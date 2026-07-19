import { z } from "zod";
import { ProductRequestSchema, productFromRequest, type ProductIdentity } from "../schema.js";
import {
  ReferencePriceSchema,
  type ReferencePrice,
} from "../marketplaces/normalize.js";
import { currencyFor, normalizeCountry, type Country } from "../marketplaces/registry.js";

export const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const GtinSchema = z
  .string()
  .regex(/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/)
  .nullable()
  .optional();

/**
 * Accept reference when valid for country; otherwise drop it.
 * Never 400 the whole deals/compare request over a bad reference - omitting
 * keeps provenance honest (no invent) while still returning offers.
 */
export function softReference(
  raw: unknown,
  country: Country
): ReferencePrice | null {
  if (raw == null) return null;
  const parsed = ReferencePriceSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.currency !== currencyFor(country)) return null;
  return parsed.data;
}

export function parseProductBody(body: unknown): {
  product: ProductIdentity;
  country: Country;
  gtin: string | null;
  asin: string | null;
  fsn: string | null;
  flipkartItemId: string | null;
  productUrl: string | null;
  location: { lat: number; lon: number } | null;
  pincode: string | undefined;
  reference: ReferencePrice | null;
  methods?: unknown;
} | { error: string; details: string } {
  const Base = z.object({
    product: ProductRequestSchema,
    gtin: GtinSchema,
    asin: z
      .string()
      .regex(/^[A-Z0-9]{10}$/i)
      .nullable()
      .optional(),
    fsn: z
      .string()
      .regex(/^[A-Z0-9]{8,20}$/i)
      .nullable()
      .optional(),
    flipkartItemId: z
      .string()
      .regex(/^itm[a-z0-9]{6,}$/i)
      .nullable()
      .optional(),
    productUrl: z.string().url().nullable().optional(),
    country: z.enum(["IN", "US"]).optional(),
    location: LocationSchema.optional(),
    pincode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    // Parsed separately via softReference - keep raw so invalid shape never 400s
    reference: z.unknown().optional(),
    methods: z.unknown().optional(),
  });

  const parsed = Base.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.length ? issue.path.join(".") : "body";
    const msg = issue?.message ?? "invalid body";
    const isName =
      path === "product.name" ||
      path === "product" ||
      msg.toLowerCase().includes("name");
    return {
      error: isName ? "Couldn’t read the product name" : `Invalid ${path}: ${msg}`,
      details: parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; "),
    };
  }

  const country = normalizeCountry(parsed.data.country);
  return {
    product: productFromRequest(parsed.data.product),
    country,
    gtin: parsed.data.gtin ?? null,
    asin: parsed.data.asin?.toUpperCase() ?? null,
    fsn: parsed.data.fsn?.toUpperCase() ?? null,
    flipkartItemId: parsed.data.flipkartItemId?.toLowerCase() ?? null,
    productUrl: parsed.data.productUrl ?? null,
    location: parsed.data.location ?? null,
    pincode: parsed.data.pincode,
    reference: softReference(parsed.data.reference, country),
    methods: parsed.data.methods,
  };
}
