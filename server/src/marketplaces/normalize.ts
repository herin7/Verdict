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

const PRICE_NUM_RE = /([\d,]+(?:\.\d{1,2})?)/;

export function parsePrice(
  raw: string | null | undefined,
  defaultCurrency: string = "INR"
): { amount: number | null; currency: string } {
  if (!raw) return { amount: null, currency: defaultCurrency };
  const currency = /\$|USD/i.test(raw) ? "USD" : /₹|Rs\.?|INR/i.test(raw) ? "INR" : defaultCurrency;
  const m = raw.replace(/,/g, "").match(PRICE_NUM_RE);
  if (!m) return { amount: null, currency };
  const amount = Number(m[1]);
  return { amount: Number.isFinite(amount) ? amount : null, currency };
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
  const parsed = parsePrice(rawPrice, currency || defaultCurrency);
  if (parsed.amount == null) return null;
  return { amount: parsed.amount, currency: currency || parsed.currency, retailerId };
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
}): MarketplaceOffer {
  const parsed = parsePrice(input.priceRaw ?? null, input.defaultCurrency ?? "INR");
  return {
    retailer: input.retailer,
    retailerId: input.retailerId,
    url: input.url,
    title: input.title,
    price: parsed.amount,
    currency: input.currency || parsed.currency,
    priceRaw: input.priceRaw ?? null,
    shipping: input.shipping ?? null,
    deliveryEstimate: input.deliveryEstimate ?? null,
    inStock: input.inStock ?? null,
    seller: input.seller ?? null,
    coupons: input.coupons ?? [],
    matchScore: input.matchScore,
    matchReason: input.matchReason,
    checkManually: input.checkManually ?? false,
  };
}
