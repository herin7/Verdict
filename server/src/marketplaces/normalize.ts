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
  checkManually?: boolean;
  isCurrentListing?: boolean;
  priceConfidence?: number | null;
  priceSource?: PriceSource;
  fieldPath?: string | null;
  fetchedAt?: string;
  locationScope?: string | null;
}

export interface ReferencePrice {
  amount: number;
  currency: string;
  retailerId?: string | null;
}

export type SupportedCurrency = "INR" | "USD";

export type ParsePriceResult = {
  amount: number | null;
  currency: SupportedCurrency;
  reason?: string;
};

export type PriceKind =
  | "current"
  | "sale"
  | "original"
  | "emi"
  | "coupon"
  | "rating"
  | "review_count"
  | "unknown";

export type PriceSource = "product_format" | "json_ld" | "meta" | "screen_text" | "search_snippet";

export const PriceKindSchema = z.enum([
  "current",
  "sale",
  "original",
  "emi",
  "coupon",
  "rating",
  "review_count",
  "unknown",
]);

export const PriceSourceSchema = z.enum([
  "product_format",
  "json_ld",
  "meta",
  "screen_text",
  "search_snippet",
]);

export const PriceCandidateSchema = z.object({
  raw: z.string(),
  context: z.string(),
  amount: z.number().positive().finite().nullable(),
  currency: z.enum(["INR", "USD"]).nullable(),
  kind: PriceKindSchema,
  source: PriceSourceSchema,
  fieldPath: z.string().nullable().optional(),
  variantKey: z.string().nullable().optional(),
});

export type PriceCandidate = z.infer<typeof PriceCandidateSchema>;

const CONTAMINATION_RE =
  /\b(rating|ratings|review|reviews|star|stars|out\s+of\s+5|customers?|sold|orders?|emi|per\s+month|\/mo|coupon|cashback|off\b|%|percent)\b/i;

const CURRENCY_MARKER_RE = /(?:₹|Rs\.?\s*|INR\b|\$|USD\b)/i;
const PRICE_WITH_MARKER_RE =
  /(?:₹|Rs\.?\s*|INR\b)\s*([\d,.]+)|(?:\$|USD\b)\s*([\d,.]+)|([\d,.]+)\s*(?:₹|Rs\.?|INR\b|\$|USD\b)/i;

const RATING_CTX_RE = /\b(out\s+of\s+5|stars?|rating)\b/i;
const REVIEW_CTX_RE = /\b(ratings?|reviews?)\b/i;
const EMI_CTX_RE = /\b(emi|per\s+month|\/\s*mo|month(?:ly)?)\b/i;
const COUPON_CTX_RE = /\b(coupon|cashback|%\s*off|percent\s+off|save\s+\d)\b/i;
/** Whole-blob fallback only when amount-local labels missing. */
const ORIGINAL_CTX_RE =
  /\b(m\.?r\.?p\.?|list\s*price|was|original(?:\s*price)?|strike(?:through)?|before|maximum\s*retail)\b/i;
const SALE_CTX_RE =
  /\b(sale(?:\s*price)?|deal(?:\s*price)?|limited\s*time\s*deal|now|payable|offer\s*price|selling\s*price|special\s*price|with\s+deal|discounted)\b/i;
/** Nearest-label scan left of a specific amount (India MRP + deal on one line). */
const ORIGINAL_LABEL_RE =
  /\b(m\.?r\.?p\.?|list\s*price|was|original(?:\s*price)?|strike(?:through)?|before|maximum\s*retail)\b/gi;
const SALE_LABEL_RE =
  /\b(sale(?:\s*price)?|deal(?:\s*price)?|limited\s*time\s*deal|now|payable|offer\s*price|selling\s*price|special\s*price|with\s+deal|discounted)\b/gi;

const CURRENCY_AMOUNT_RE =
  /(?:₹|Rs\.?\s*|INR\b|Rupees?\s*|\$|USD\b)\s*[\d,.]+|[\d,.]+\s*(?:USD\b|INR\b|Rs\.?\b)/gi;

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
  priceSource: PriceSourceSchema.optional(),
  fieldPath: z.string().nullable().optional(),
  fetchedAt: z.string().datetime().optional(),
  locationScope: z.string().nullable().optional(),
});

export const StructuredProductDataSchema = z
  .object({
    title: z.string().nullable().optional(),
    brand: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    price: z.union([z.string(), z.number()]).nullable().optional(),
    currency: z.string().nullable().optional(),
    originalPrice: z.union([z.string(), z.number()]).nullable().optional(),
    currentPrice: z.union([z.string(), z.number()]).nullable().optional(),
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

  if (/^\d{1,3}(,\d{2})+(,\d{3})?(\.\d{1,2})?$/.test(cleaned) || /^\d{1,2},\d{2},\d{3}(\.\d{1,2})?$/.test(cleaned)) {
    const n = Number(cleaned.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(cleaned)) {
    const n = Number(cleaned.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  if (/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) return null;

  const stripped = cleaned.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(stripped)) return null;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

/**
 * Attribute kind from the nearest MRP/sale label to the LEFT of this amount,
 * only within the span after the previous currency amount.
 * Prevents "M.R.P. ₹2999 Deal ₹1499" from marking both as original,
 * and "M.R.P. ₹34990 ₹29990" from marking the unlabeled sale as original.
 */
export function nearestPriceLabelKind(context: string, amountRaw: string): PriceKind | null {
  const raw = amountRaw.trim();
  if (!raw || !context) return null;
  const pos = context.indexOf(raw);
  if (pos < 0) return null;
  let start = Math.max(0, pos - 56);
  CURRENCY_AMOUNT_RE.lastIndex = 0;
  for (const m of context.matchAll(CURRENCY_AMOUNT_RE)) {
    const mEnd = (m.index ?? 0) + m[0].length;
    if (mEnd <= pos && m[0].trim() !== raw) start = Math.max(start, mEnd);
  }
  const before = context.slice(start, pos);
  let bestOrig = -1;
  let bestSale = -1;
  ORIGINAL_LABEL_RE.lastIndex = 0;
  for (const m of before.matchAll(ORIGINAL_LABEL_RE)) {
    bestOrig = Math.max(bestOrig, m.index ?? -1);
  }
  SALE_LABEL_RE.lastIndex = 0;
  for (const m of before.matchAll(SALE_LABEL_RE)) {
    bestSale = Math.max(bestSale, m.index ?? -1);
  }
  if (bestOrig < 0 && bestSale < 0) return null;
  if (bestSale > bestOrig) return "sale";
  if (bestOrig > bestSale) return "original";
  return bestOrig >= 0 ? "original" : "sale";
}

/** Slice owned by one amount: after previous currency match through a short tail. */
function amountLocalSpan(context: string, amountRaw: string): string | null {
  const raw = amountRaw.trim();
  const pos = context.indexOf(raw);
  if (pos < 0) return null;
  const end = pos + raw.length;
  let start = Math.max(0, pos - 56);
  CURRENCY_AMOUNT_RE.lastIndex = 0;
  for (const m of context.matchAll(CURRENCY_AMOUNT_RE)) {
    const mStart = m.index ?? 0;
    const mEnd = mStart + m[0].length;
    if (mEnd <= pos && m[0].trim() !== raw) start = Math.max(start, mEnd);
    if (mStart > pos && m[0].trim() !== raw) {
      return context.slice(start, Math.min(mStart, end + 28));
    }
  }
  return context.slice(start, Math.min(context.length, end + 28));
}

function contaminationKindInSpan(span: string, amountRaw: string): PriceKind | null {
  const pos = span.indexOf(amountRaw.trim());
  const before = pos >= 0 ? span.slice(0, pos) : span;
  const after = pos >= 0 ? span.slice(pos + amountRaw.trim().length) : "";
  // Rating/review describe the number when glued after it (or labeled before).
  if (/\bout\s+of\s+5\b|\bstars?\b/i.test(before + after) && !/\bratings?\b/i.test(before + after)) {
    return "rating";
  }
  if (/\b(ratings?|reviews?)\b/i.test(after) || /\b(ratings?|reviews?)\b/i.test(before)) {
    return "review_count";
  }
  // EMI applies to installment amount: label before it, or /mo right after — not the sale above.
  if (EMI_CTX_RE.test(before) || /^\s*(\/\s*mo|per\s+month|month(?:ly)?)\b/i.test(after)) {
    return "emi";
  }
  if (COUPON_CTX_RE.test(before) || COUPON_CTX_RE.test(after.slice(0, 24))) return "coupon";
  return null;
}

/** Classify price kind from surrounding text + optional field path + amount-local labels. */
export function classifyPriceKind(
  context: string,
  fieldPath?: string | null,
  amountRaw?: string | null
): PriceKind {
  if (/originalPrice|listPrice|mrp/i.test(fieldPath ?? "")) return "original";
  if (/currentPrice|salePrice|dealPrice/i.test(fieldPath ?? "")) return "sale";
  if (/^(price|offers?\.price|lowPrice)$/i.test((fieldPath ?? "").trim())) return "current";

  if (amountRaw) {
    const span = amountLocalSpan(context, amountRaw) ?? context;
    const contaminated = contaminationKindInSpan(span, amountRaw);
    if (contaminated) return contaminated;
    const near = nearestPriceLabelKind(context, amountRaw);
    if (near) return near;
    // No local label: do not inherit distant MRP/Was from elsewhere on the line.
    return "unknown";
  }

  const blob = `${fieldPath ?? ""} ${context}`;
  if (RATING_CTX_RE.test(blob) && !REVIEW_CTX_RE.test(blob.replace(RATING_CTX_RE, ""))) {
    if (/\bout\s+of\s+5\b|\bstars?\b/i.test(blob)) return "rating";
  }
  if (RATING_CTX_RE.test(blob) && !/\bratings?\b/i.test(blob)) return "rating";
  if (REVIEW_CTX_RE.test(blob)) return "review_count";
  if (EMI_CTX_RE.test(blob)) return "emi";
  if (COUPON_CTX_RE.test(blob)) return "coupon";
  if (ORIGINAL_CTX_RE.test(blob)) return "original";
  if (SALE_CTX_RE.test(blob)) return "sale";
  return "unknown";
}

export function isPayableKind(kind: PriceKind): boolean {
  return kind === "current" || kind === "sale";
}

/**
 * Build evidence from raw + full surrounding context. Never strip labels before classify.
 */
export function buildPriceCandidate(input: {
  raw: string | number | null | undefined;
  context?: string | null;
  source: PriceSource;
  fieldPath?: string | null;
  declaredCurrency?: string | null;
  defaultCurrency?: string | null;
  variantKey?: string | null;
  allowBareNumeric?: boolean;
}): PriceCandidate {
  const fallback = normalizeCurrencyCode(input.defaultCurrency) ?? "INR";
  const rawStr = input.raw == null ? "" : String(input.raw).trim();
  const context = (input.context ?? rawStr).trim() || rawStr;
  const kind = classifyPriceKind(context, input.fieldPath, rawStr || null);
  const declared = normalizeCurrencyCode(input.declaredCurrency);

  if (!rawStr) {
    return {
      raw: "",
      context,
      amount: null,
      currency: declared,
      kind,
      source: input.source,
      fieldPath: input.fieldPath ?? null,
      variantKey: input.variantKey ?? null,
    };
  }

  // Contaminated kinds never become payable amounts
  if (kind === "rating" || kind === "review_count" || kind === "emi" || kind === "coupon") {
    return {
      raw: rawStr,
      context,
      amount: null,
      currency: declared ?? detectCurrencyFromText(context) ?? null,
      kind,
      source: input.source,
      fieldPath: input.fieldPath ?? null,
      variantKey: input.variantKey ?? null,
    };
  }

  if (CONTAMINATION_RE.test(context) && kind === "unknown") {
    const contaminatedKind = REVIEW_CTX_RE.test(context)
      ? "review_count"
      : RATING_CTX_RE.test(context)
        ? "rating"
        : EMI_CTX_RE.test(context)
          ? "emi"
          : COUPON_CTX_RE.test(context)
            ? "coupon"
            : "unknown";
    if (contaminatedKind !== "unknown") {
      return {
        raw: rawStr,
        context,
        amount: null,
        currency: declared ?? detectCurrencyFromText(context) ?? null,
        kind: contaminatedKind,
        source: input.source,
        fieldPath: input.fieldPath ?? null,
        variantKey: input.variantKey ?? null,
      };
    }
  }

  const parsed = parsePrice(rawStr, declared || fallback, {
    allowBareNumeric:
      input.allowBareNumeric ??
      (Boolean(declared) ||
        Boolean(input.fieldPath && /price|currentPrice|salePrice/i.test(input.fieldPath))),
    declaredCurrency: declared,
  });

  // Reject rating-band amounts unless explicitly sale/current with currency marker
  if (parsed.amount != null && parsed.amount <= 5) {
    const hasMarker = CURRENCY_MARKER_RE.test(rawStr) || CURRENCY_MARKER_RE.test(context);
    if (!hasMarker || !isPayableKind(kind)) {
      return {
        raw: rawStr,
        context,
        amount: null,
        currency: parsed.currency,
        kind: kind === "unknown" ? "rating" : kind,
        source: input.source,
        fieldPath: input.fieldPath ?? null,
        variantKey: input.variantKey ?? null,
      };
    }
  }

  let finalKind = kind;
  if (kind === "unknown" && input.fieldPath && /currentPrice|salePrice|^price$/i.test(input.fieldPath)) {
    if (!/original|mrp|list/i.test(input.fieldPath)) finalKind = "current";
  }
  if (finalKind === "unknown" && parsed.amount != null && parsed.amount > 5) {
    finalKind = "current";
  }

  const currency =
    parsed.amount != null ? parsed.currency : declared ?? detectCurrencyFromText(context) ?? null;

  // original keeps amount for strike-through metadata; payableFromEvidence still excludes it
  if (finalKind === "original") {
    return {
      raw: rawStr,
      context,
      amount: parsed.amount,
      currency,
      kind: finalKind,
      source: input.source,
      fieldPath: input.fieldPath ?? null,
      variantKey: input.variantKey ?? null,
    };
  }

  return {
    raw: rawStr,
    context,
    amount: isPayableKind(finalKind) ? parsed.amount : null,
    currency,
    kind: finalKind,
    source: input.source,
    fieldPath: input.fieldPath ?? null,
    variantKey: input.variantKey ?? null,
  };
}

/** Only current/sale with amount+currency become payable. */
export function payableFromEvidence(c: PriceCandidate | null | undefined): {
  amount: number;
  currency: SupportedCurrency;
} | null {
  if (!c || c.amount == null || !c.currency) return null;
  if (!isPayableKind(c.kind)) return null;
  return { amount: c.amount, currency: c.currency };
}

/**
 * Rank payable candidates: sale > current; near-tie or unlabeled dual → lower amount.
 * EMI/coupon/original never enter (filtered by payableFromEvidence).
 */
export function pickBestPayableCandidate(
  candidates: PriceCandidate[],
  scoreExtra?: (c: PriceCandidate) => number
): PriceCandidate | null {
  const payable = candidates.filter((c) => payableFromEvidence(c));
  if (!payable.length) return null;

  const scored = payable.map((cand) => {
    let score = 0;
    if (cand.kind === "sale") score += 40;
    if (cand.kind === "current") score += 20;
    score += scoreExtra?.(cand) ?? 0;
    return { cand, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const top = scored[0]!;
  const sale = scored.find((s) => s.cand.kind === "sale");
  if (sale && top.cand.kind !== "sale") return sale.cand;

  // India unlabeled MRP+selling: exactly two currents, typical markdown band → cheaper.
  if (payable.length === 2 && payable.every((c) => c.kind === "current")) {
    const amounts = payable.map((c) => c.amount!).sort((a, b) => a - b);
    const lo = amounts[0]!;
    const hi = amounts[1]!;
    const ratio = hi / Math.max(lo, 1);
    if (ratio >= 1.12 && ratio <= 2.5) {
      return payable.find((c) => c.amount === lo) ?? top.cand;
    }
  }

  const rival = scored.find(
    (s) =>
      s.cand !== top.cand &&
      s.cand.amount != null &&
      top.cand.amount != null &&
      Math.abs(s.cand.amount - top.cand.amount) / Math.max(top.cand.amount, 1) > 0.15 &&
      Math.abs(s.score - top.score) < 20
  );
  if (rival && top.cand.amount != null && rival.cand.amount != null) {
    return top.cand.amount <= rival.cand.amount ? top.cand : rival.cand;
  }
  return top.cand;
}

/** Scan text for currency amounts; return best payable (sale/current over MRP). */
export function pickBestPayableFromText(
  text: string,
  opts: {
    source: PriceSource;
    defaultCurrency?: string | null;
    declaredCurrency?: string | null;
  }
): PriceCandidate | null {
  const defaultCurrency = normalizeCurrencyCode(opts.defaultCurrency) ?? "INR";
  const declared = normalizeCurrencyCode(opts.declaredCurrency);
  const candidates: PriceCandidate[] = [];
  CURRENCY_AMOUNT_RE.lastIndex = 0;
  for (const m of text.matchAll(CURRENCY_AMOUNT_RE)) {
    const raw = m[0]?.trim();
    if (!raw || raw.length < 2) continue;
    if (!/\d/.test(raw)) continue;
    // Reject bridge matches like "34,990 ₹" from "₹34,990 ₹29,990" (digits + next glyph).
    if (/^\d[\d,.]*\s*[₹$]\s*$/.test(raw)) continue;
    candidates.push(
      buildPriceCandidate({
        raw,
        context: text,
        source: opts.source,
        declaredCurrency: declared ?? defaultCurrency,
        defaultCurrency,
        allowBareNumeric: false,
      })
    );
  }
  return pickBestPayableCandidate(candidates);
}

/**
 * Validated price parser. Ratings/reviews/EMI/coupon text never become prices.
 * Prefer buildPriceCandidate when surrounding context exists.
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

  // Rating-band: floats and integers 1-5 without strong currency+sale context
  if (amount <= 5) {
    if (!hasMarker) {
      return { amount: null, currency: declared ?? fallback, reason: "looks_like_rating" };
    }
    // Currency-marked tiny amounts still rejected unless clearly not a star score
    if (Number.isInteger(amount) || String(numRaw).includes(".")) {
      // Allow ₹5 / $5 candy-style only when integer and has marker - keep integer 1-5 rejected
      if (Number.isInteger(amount) && amount <= 5) {
        return { amount: null, currency: markerCurrency ?? declared ?? fallback, reason: "looks_like_rating" };
      }
      if (!Number.isInteger(amount)) {
        return { amount: null, currency: markerCurrency ?? declared ?? fallback, reason: "looks_like_rating" };
      }
    }
  }

  const currency = markerCurrency ?? declared ?? fallback;
  return { amount, currency };
}

export function toReferencePrice(
  rawPrice: string | null | undefined,
  currency: string | null | undefined,
  retailerId: string | null,
  defaultCurrency: string = "INR",
  context?: string | null
): ReferencePrice | null {
  const candidate = buildPriceCandidate({
    raw: rawPrice,
    context: context ?? rawPrice,
    source: "screen_text",
    declaredCurrency: currency,
    defaultCurrency,
    allowBareNumeric: Boolean(normalizeCurrencyCode(currency)),
  });
  const payable = payableFromEvidence(candidate);
  if (!payable) return null;
  return { amount: payable.amount, currency: payable.currency, retailerId };
}

export function coerceStructuredPrice(
  price: string | number | null | undefined,
  currency: string | null | undefined,
  defaultCurrency: string = "INR",
  opts: { fieldPath?: string | null; context?: string | null } = {}
): ParsePriceResult {
  const declared = normalizeCurrencyCode(currency) ?? normalizeCurrencyCode(defaultCurrency) ?? "INR";
  const candidate = buildPriceCandidate({
    raw: price,
    context: opts.context ?? (price != null ? String(price) : ""),
    source: "product_format",
    fieldPath: opts.fieldPath ?? "price",
    declaredCurrency: declared,
    defaultCurrency: declared,
    allowBareNumeric: true,
  });
  const payable = payableFromEvidence(candidate);
  if (!payable) {
    if (candidate.kind === "original" && candidate.amount != null && candidate.currency) {
      // original is not payable - callers that want strike-through use buildPriceCandidate
      return { amount: null, currency: candidate.currency, reason: "original_not_payable" };
    }
    return {
      amount: null,
      currency: declared,
      reason: candidate.kind === "rating" || candidate.kind === "review_count" ? "looks_like_rating" : "rejected",
    };
  }
  return { amount: payable.amount, currency: payable.currency };
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

export function filterOffersByCurrency(offers: MarketplaceOffer[], currency: string): MarketplaceOffer[] {
  return offers.filter((o) => !o.currency || o.currency === currency);
}

/**
 * Deals list gate: keep only verified priced offers.
 * - Missing platform / no match → omit (no check-manually shell)
 * - OOS with a real price → keep (caller sorts / labels OOS)
 */
export function filterPricedOffers(offers: MarketplaceOffer[]): MarketplaceOffer[] {
  return offers.filter(
    (o) =>
      !o.checkManually &&
      o.matchReason !== "check_manually" &&
      o.price != null &&
      o.price > 0
  );
}

/** Available priced first, then OOS-with-price, then by amount ascending. */
export function sortOffersForDeals(offers: MarketplaceOffer[]): MarketplaceOffer[] {
  return [...offers].sort((a, b) => {
    const stockRank = (o: MarketplaceOffer) => (o.inStock === false ? 1 : 0);
    const d = stockRank(a) - stockRank(b);
    if (d !== 0) return d;
    return (a.price ?? Infinity) - (b.price ?? Infinity);
  });
}

const OOS_TEXT_RE = /\b(out\s+of\s+stock|currently\s+unavailable|sold\s+out|unavailable)\b/i;
const IN_STOCK_TEXT_RE = /\b(in\s+stock|only\s+\d+\s+left|add\s+to\s+cart|buy\s+now)\b/i;

/** Prefer structured flag; else sniff title/snippet. Never invent stock. */
export function inferStockStatus(
  text: string | null | undefined,
  structured: boolean | null | undefined
): boolean | null {
  if (typeof structured === "boolean") return structured;
  if (!text) return null;
  if (OOS_TEXT_RE.test(text)) return false;
  if (IN_STOCK_TEXT_RE.test(text)) return true;
  return null;
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
  priceContext?: string | null;
  priceSource?: PriceSource;
  fieldPath?: string | null;
  fetchedAt?: string;
  locationScope?: string | null;
}): MarketplaceOffer {
  const defaultCurrency = normalizeCurrencyCode(input.defaultCurrency) ?? "INR";
  const declared = normalizeCurrencyCode(input.currency ?? null);
  const candidate = buildPriceCandidate({
    raw: input.priceRaw,
    context: input.priceContext ?? input.priceRaw,
    source: input.priceSource ?? "search_snippet",
    fieldPath: input.fieldPath,
    declaredCurrency: declared,
    defaultCurrency,
    allowBareNumeric: Boolean(declared),
  });
  let payable = payableFromEvidence(candidate);
  // Caller may pass first-regex MRP; rescan full context for sale/current.
  if (!payable && input.priceContext) {
    const best = pickBestPayableFromText(input.priceContext, {
      source: input.priceSource ?? "search_snippet",
      defaultCurrency,
      declaredCurrency: declared,
    });
    payable = payableFromEvidence(best);
    if (payable && best) {
      return {
        retailer: input.retailer,
        retailerId: input.retailerId,
        url: input.url,
        title: input.title,
        price: payable.amount,
        currency: payable.currency,
        priceRaw: best.raw,
        shipping: input.shipping ?? null,
        deliveryEstimate: input.deliveryEstimate ?? null,
        inStock: input.inStock ?? null,
        seller: input.seller ?? null,
        coupons: input.coupons ?? [],
        matchScore: input.matchScore,
        matchReason: input.matchReason,
        checkManually: input.checkManually ?? false,
        priceConfidence: input.priceConfidence ?? null,
        priceSource: input.priceSource,
        fieldPath: input.fieldPath ?? null,
        fetchedAt: input.fetchedAt ?? new Date().toISOString(),
        locationScope: input.locationScope ?? null,
      };
    }
  }
  const currency = payable?.currency ?? declared ?? defaultCurrency;

  return {
    retailer: input.retailer,
    retailerId: input.retailerId,
    url: input.url,
    title: input.title,
    price: payable?.amount ?? null,
    currency,
    // Never keep contaminated raw for UI fallback - only clean payable provenance
    priceRaw: payable ? (input.priceRaw ?? null) : null,
    shipping: input.shipping ?? null,
    deliveryEstimate: input.deliveryEstimate ?? null,
    inStock: input.inStock ?? null,
    seller: input.seller ?? null,
    coupons: input.coupons ?? [],
    matchScore: input.matchScore,
    matchReason: input.matchReason,
    checkManually: input.checkManually ?? false,
    priceConfidence: input.priceConfidence ?? null,
    priceSource: input.priceSource,
    fieldPath: input.fieldPath ?? null,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    locationScope: input.locationScope ?? null,
  };
}

export function sanitizeCachedOffers(raw: unknown): MarketplaceOffer[] {
  if (!Array.isArray(raw)) return [];
  const out: MarketplaceOffer[] = [];
  for (const item of raw) {
    const parsed = MarketplaceOfferSchema.safeParse(item);
    if (!parsed.success) continue;
    const row = parsed.data;

    if (row.price == null) {
      // Drop contaminated raw so UI cannot fall back to it
      out.push({ ...row, priceRaw: null });
      continue;
    }

    if (!row.priceRaw) {
      // Legacy numeric without provenance - discard price
      out.push({ ...row, price: null, priceRaw: null });
      continue;
    }

    const candidate = buildPriceCandidate({
      raw: row.priceRaw,
      context: row.priceRaw,
      source: "product_format",
      fieldPath: "price",
      declaredCurrency: row.currency,
      defaultCurrency: row.currency,
      allowBareNumeric: true,
    });
    const payable = payableFromEvidence(candidate);
    if (!payable || payable.amount !== row.price || payable.currency !== row.currency) {
      out.push({ ...row, price: null, priceRaw: null });
      continue;
    }
    out.push(row);
  }
  return out;
}
