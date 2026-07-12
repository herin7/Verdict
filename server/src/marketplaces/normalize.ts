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
}

const PRICE_NUM_RE = /([\d,]+(?:\.\d{1,2})?)/;

export function parsePrice(raw: string | null | undefined): { amount: number | null; currency: string } {
  if (!raw) return { amount: null, currency: "INR" };
  const currency = /\$|USD/i.test(raw) ? "USD" : "INR";
  const m = raw.replace(/,/g, "").match(PRICE_NUM_RE);
  if (!m) return { amount: null, currency };
  const amount = Number(m[1]);
  return { amount: Number.isFinite(amount) ? amount : null, currency };
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
  shipping?: string | null;
  deliveryEstimate?: string | null;
  inStock?: boolean | null;
  seller?: string | null;
  coupons?: string[];
  matchScore: number;
  matchReason: string;
}): MarketplaceOffer {
  const parsed = parsePrice(input.priceRaw ?? null);
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
  };
}
