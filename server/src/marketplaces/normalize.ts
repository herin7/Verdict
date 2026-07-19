import { z } from "zod";

export interface MarketplaceOffer {
  retailer: string;
  retailerId: string;
  url: string;
  title: string;
  price: number | null;
  currency: string;
  priceRaw: string | null;
  shipping: string | null;
  deliveryEstimate: string | null;
  inStock: boolean | null;
  seller: string | null;
  coupons: string[];
  matchScore: number;
  matchReason: string;
  /** True for deeplinkOnly platforms - no live price fetched, url is a "check manually" link. */
  checkManually?: boolean;
  /**
   * True when this offer is for the SAME platform the user is already looking
   * at (matched by retailerId against the request's ReferencePrice). Its price
   * has been forced to the live on-screen reference price - never a fresh/cached
   * re-scrape - since a re-scrape of "the same listing" can disagree (stale
   * cache, wrong variant, different currency) with what the user is seeing right
   * now. Never eligible to be flagged as a "deal" (see deals/calculator.ts).
   */
  isCurrentListing?: boolean;
  /** Optional confidence 0-1 when location/pincode was only approximate. */
  priceConfidence?: number | null;
}

/**
 * The price the user is ALREADY looking at, extracted from their own current
 * screen/screenshot (e.g. accessibility screen-text priceHint, or JSON-LD/meta
 * price from a pasted URL). Treated as authoritative/live for `retailerId`
 * (when known) - never overridden by a separate re-scrape of the same platform.
 */
export interface ReferencePrice {
  amount: number;
  currency: string;
  /** Marketplace id the user is currently viewing, if known (e.g. from packageName
   *  or the pasted URL's domain). Enables same-platform self-comparison guards. */
  retailerId?: string | null;
}

export type SupportedCurrency = "INR" | "USD";

export type ParsePriceResult = {
  amount: number | null;
  currency: SupportedCurrency;
  reason?: string;
};

const CONTAMINATION_RE =
  /\b(rating|ratings|review|reviews|star|stars|out\s+of\s+5|customers?|sold|orders?|emi|per\s+month|\/mo|coupon|cashback|off\b|%|percent)\b/i;

const CURRENCY_MARKER_RE = /(?:₹|Rs\.?\s*|INR\b|\$|USD\b)/i;
const PRICE_WITH_MARKER_RE =
  /(?:₹|Rs\.?\s*|INR\b)\s*([\d,.]+)|(?:\$|USD\b)\s*([\d,.]+)|([\d,.]+)\s*(?:₹|Rs\.?|INR\b|\$|USD\b)/i;

export const SupportedCurrencySchema = z.enum(["INR", "USD"]);

export const ReferencePriceSchema = z.object({
  amount: z.number().positive().finite(),
  currency: SupportedCurrencySchema,
  retailerId: z.string().nullable().optional(),
});

export const MarketplaceOfferSchema = z.object({
  retailer: z.string().min(1),
  retailerId: z.string().min(1),
  url: z.string().min(1),
  title: z.string(),
  price: z.number().positive().finite().nullable(),
  currency: SupportedCurrencySchema,
  priceRaw: z.string().nullable(),
  shipping: z.string().nullable(),
  deliveryEstimate: z.string().nullable(),
  inStock: z.boolean().nullable(),
  seller: z.string().nullable(),
  coupons: z.array(z.string()),
  matchScore: z.number().min(0).max(1),
  matchReason: z.string(),
  checkManually: z.boolean().optional(),
  isCurrentListing: z.boolean().optional(),
  priceConfidence: z.number().min(0).max(1).nullable().optional(),
});

export const StructuredProductDataSchema = z
  .object({
    title: z.string().nullable().optional(),
    brand: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    price: z.union([z.string(), z.number()]).nullable().optional(),
    currency: z.string().nullable().optional(),
    originalPrice: z.union([z.string(), z.number()]).nullable().optional(),
    gtin: z.string().nullable().optional(),
    upc: z.string().nullable().optional(),
    ean: z.string().nullable().optional(),
    sku: z.string().nullable().optional(),
    seller: z.string().nullable().optional(),
    inStock: z.boolean().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    variants: z
      .array(
        z.object({
          title: z.string().nullable().optional(),
          price: z.union([z.string(), z.number()]).nullable().optional(),
          originalPrice: z.union([z.string(), z.number()]).nullable().optional(),
          currency: z.string().nullable().optional(),
          availability: z.string().nullable().optional(),
          sku: z.string().nullable().optional(),
          gtin: z.string().nullable().optional(),
        })
      )
      .nullable()
      .optional(),
  })
  .passthrough();

export type StructuredProductData = z.infer<typeof StructuredProductDataSchema>;

export function normalizeCurrencyCode(raw: string | null | undefined): SupportedCurrency | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (s === "INR" || s === "RS" || s === "RS." || s === "₹") return "INR";
  if (s === "USD" || s === "$") return "USD";
  if (/₹|RS\.?|INR/.test(s)) return "INR";
  if (/\$|USD/.test(s)) return "USD";
  return null;
}

function detectCurrencyFromText(raw: string): SupportedCurrency | null {
  if (/₹|Rs\.?|INR/i.test(raw)) return "INR";
  if (/\$|USD/i.test(raw)) return "USD";
  return null;
}

/** Parse Indian/Western grouped numbers: 1,24,999 or 12,483.50 or 29999 */
export function parseGroupedNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  // Indian lakh grouping: 1,24,999 or 12,34,567.89
  if (/^\d{1,3}(,\d{2})+(,\d{3})?(\.\d{1,2})?$/.test(cleaned) || /^\d{1,2},\d{2},\d{3}(\.\d{1,2})?$/.test(cleaned)) {
    const n = Number(cleaned.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  // Western: 12,483.50 or 12483
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(cleaned)) {
    const n = Number(cleaned.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  // Plain digits / decimal without thousands separators
  if (/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  // Ambiguous European style 1.234,56 — reject rather than guess
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) return null;

  // Last resort: strip commas only if no conflicting dots as thousands
  const stripped = cleaned.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(stripped)) return null;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validated price parser. Ratings/reviews/EMI/coupon text never become prices.
 * Bare numbers require allowBareNumeric + a validated defaultCurrency (structured extract path).
 */
export function parsePrice(
  raw: string | null | undefined,
  defaultCurrency: string = "INR",
  opts: { allowBareNumeric?: boolean; declaredCurrency?: string | null } = {}
): ParsePriceResult {
  const fallback = (normalizeCurrencyCode(defaultCurrency) ?? "INR") as SupportedCurrency;
  if (raw == null) return { amount: null, currency: fallback, reason: "empty" };

  const text = String(raw).trim();
  if (!text) return { amount: null, currency: fallback, reason: "empty" };

  if (CONTAMINATION_RE.test(text)) {
    return { amount: null, currency: fallback, reason: "contamination" };
  }

  const markerCurrency = detectCurrencyFromText(text);
  const declared = normalizeCurrencyCode(opts.declaredCurrency ?? null);

  // Currency conflict: price text says $ but declared INR (or vice versa) — trust marker, else reject if both disagree with no marker
  if (markerCurrency && declared && markerCurrency !== declared) {
    // Prefer marker in the raw string; continue with markerCurrency
  }

  const hasMarker = CURRENCY_MARKER_RE.test(text);
  if (!hasMarker && !opts.allowBareNumeric) {
    return { amount: null, currency: declared ?? fallback, reason: "ambiguous_bare" };
  }

  let numRaw: string | null = null;
  if (hasMarker) {
    const m = text.match(PRICE_WITH_MARKER_RE);
    numRaw = m?.[1] || m?.[2] || m?.[3] || null;
  } else {
    const m = text.match(/([\d,.]+)/);
    numRaw = m?.[1] ?? null;
  }
  if (!numRaw) return { amount: null, currency: markerCurrency ?? declared ?? fallback, reason: "no_number" };

  const amount = parseGroupedNumber(numRaw);
  if (amount == null) return { amount: null, currency: markerCurrency ?? declared ?? fallback, reason: "malformed" };
  if (!(amount > 0) || !Number.isFinite(amount)) {
    return { amount: null, currency: markerCurrency ?? declared ?? fallback, reason: "nonpositive" };
  }

  // Sanity: rating-like floats (1.0–5.0) without currency marker are never prices even with allowBareNumeric
  if (!hasMarker && amount <= 5 && amount === Math.round(amount * 10) / 10 && String(numRaw).includes(".")) {
    return { amount: null, currency: declared ?? fallback, reason: "looks_like_rating" };
  }

  const currency = markerCurrency ?? declared ?? fallback;
  return { amount, currency };
}

/**
 * Builds a ReferencePrice from a raw price string (e.g. a screen-text priceHint
 * or a JSON-LD offer price) plus a known/likely currency and retailer. Returns
 * null when no numeric price can be parsed - callers must never fabricate a
 * reference price.
 */
export function toReferencePrice(
  rawPrice: string | null | undefined,
  currency: string | null | undefined,
  retailerId: string | null,
  defaultCurrency: string = "INR"
): ReferencePrice | null {
  const declared = normalizeCurrencyCode(currency);
  const parsed = parsePrice(rawPrice, declared || defaultCurrency, {
    // Screen/JSON-LD often give bare "29999" with a separate currency field
    allowBareNumeric: Boolean(declared) || Boolean(rawPrice && CURRENCY_MARKER_RE.test(String(rawPrice))),
    declaredCurrency: declared,
  });
  // If raw has no marker but we have declared currency, allow bare numeric
  if (parsed.amount == null && declared && rawPrice) {
    const retry = parsePrice(rawPrice, declared, { allowBareNumeric: true, declaredCurrency: declared });
    if (retry.amount == null) return null;
    return { amount: retry.amount, currency: retry.currency, retailerId };
  }
  if (parsed.amount == null) return null;
  return { amount: parsed.amount, currency: parsed.currency, retailerId };
}

export function coerceStructuredPrice(
  price: string | number | null | undefined,
  currency: string | null | undefined,
  defaultCurrency: string = "INR"
): ParsePriceResult {
  const declared = normalizeCurrencyCode(currency) ?? normalizeCurrencyCode(defaultCurrency) ?? "INR";
  if (price == null) return { amount: null, currency: declared, reason: "empty" };
  if (typeof price === "number") {
    if (!(price > 0) || !Number.isFinite(price)) return { amount: null, currency: declared, reason: "nonpositive" };
    // 4.4-style one-decimal floats in the rating band are almost never list prices
    if (price <= 5 && !Number.isInteger(price) && Math.round(price * 10) / 10 === price) {
      return { amount: null, currency: declared, reason: "looks_like_rating" };
    }
    return { amount: price, currency: declared };
  }
  return parsePrice(price, declared, { allowBareNumeric: true, declaredCurrency: declared });
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );
}

/** Jaccard-ish title similarity for semantic matching. */
export function titleSimilarity(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function matchScore(opts: {
  productName: string;
  productBrand: string | null;
  productModel: string | null;
  productGtin?: string | null;
  candidateTitle: string;
  candidateGtin?: string | null;
}): { score: number; reason: string } {
  if (opts.productGtin && opts.candidateGtin && opts.productGtin === opts.candidateGtin) {
    return { score: 1, reason: "gtin" };
  }

  let score = titleSimilarity(opts.productName, opts.candidateTitle);
  const reasons: string[] = ["title"];

  if (opts.productBrand) {
    const brand = opts.productBrand.toLowerCase();
    if (opts.candidateTitle.toLowerCase().includes(brand)) {
      score = Math.min(1, score + 0.15);
      reasons.push("brand");
    }
  }
  if (opts.productModel) {
    const model = opts.productModel.toLowerCase();
    if (opts.candidateTitle.toLowerCase().includes(model)) {
      score = Math.min(1, score + 0.2);
      reasons.push("model");
    }
  }

  return { score, reason: reasons.join("+") };
}

/**
 * The single "hide mismatches" gate: an offer whose currency doesn't match
 * the user's own country currency is DROPPED, never relabeled.
 */
export function filterOffersByCurrency(offers: MarketplaceOffer[], currency: string): MarketplaceOffer[] {
  return offers.filter((o) => !o.currency || o.currency === currency);
}

export function normalizeOffer(input: {
  retailer: string;
  retailerId: string;
  url: string;
  title: string;
  priceRaw?: string | null;
  currency?: string | null;
  defaultCurrency?: string | null;
  shipping?: string | null;
  deliveryEstimate?: string | null;
  inStock?: boolean | null;
  seller?: string | null;
  coupons?: string[];
  matchScore: number;
  matchReason: string;
  checkManually?: boolean;
  priceConfidence?: number | null;
}): MarketplaceOffer {
  const defaultCurrency = normalizeCurrencyCode(input.defaultCurrency) ?? "INR";
  const declared = normalizeCurrencyCode(input.currency ?? null);
  const parsed = parsePrice(input.priceRaw ?? null, defaultCurrency, {
    allowBareNumeric: Boolean(declared),
    declaredCurrency: declared,
  });

  // Marker in raw text wins over contradictory declared currency
  const currency = parsed.amount != null ? parsed.currency : declared ?? defaultCurrency;

  return {
    retailer: input.retailer,
    retailerId: input.retailerId,
    url: input.url,
    title: input.title,
    price: parsed.amount,
    currency,
    priceRaw: input.priceRaw ?? null,
    shipping: input.shipping ?? null,
    deliveryEstimate: input.deliveryEstimate ?? null,
    inStock: input.inStock ?? null,
    seller: input.seller ?? null,
    coupons: input.coupons ?? [],
    matchScore: input.matchScore,
    matchReason: input.matchReason,
    checkManually: input.checkManually ?? false,
    priceConfidence: input.priceConfidence ?? null,
  };
}

export function sanitizeCachedOffers(raw: unknown): MarketplaceOffer[] {
  if (!Array.isArray(raw)) return [];
  const out: MarketplaceOffer[] = [];
  for (const item of raw) {
    const parsed = MarketplaceOfferSchema.safeParse(item);
    if (!parsed.success) continue;
    // Re-validate priceRaw against contamination for legacy cache rows
    if (parsed.data.price != null && parsed.data.priceRaw) {
      const check = parsePrice(parsed.data.priceRaw, parsed.data.currency, {
        allowBareNumeric: true,
        declaredCurrency: parsed.data.currency,
      });
      if (check.amount == null || check.reason === "contamination" || check.reason === "looks_like_rating") {
        out.push({ ...parsed.data, price: null, priceRaw: parsed.data.priceRaw });
        continue;
      }
    }
    out.push(parsed.data);
  }
  return out;
}
