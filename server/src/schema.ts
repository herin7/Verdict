import { z } from "zod";

export const RejectReasonSchema = z.enum([
  "nudity",
  "person",
  "vehicle",
  "animal",
  "landscape",
  "meme",
  "document",
  "screenshot",
  "not_a_product",
  "other",
]);
export type RejectReason = z.infer<typeof RejectReasonSchema>;

export const ProductIdentitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: z.string().nullable(),
  category: z.string().trim().min(1).max(80),
  model: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  searchTerm: z.string().trim().min(1).max(200),
});
export type ProductIdentity = z.infer<typeof ProductIdentitySchema>;

/**
 * Product body for /deals, /compare, /research - same shape identify returns.
 * Must stay aligned with ProductIdentitySchema limits (not tighter), or identify
 * succeeds and deals/compare 400 on the same product.
 */
export const ProductRequestSchema = ProductIdentitySchema.partial({
  brand: true,
  model: true,
  confidence: true,
  searchTerm: true,
  category: true,
}).extend({
  name: z.string().trim().min(1).max(200),
  // Empty/missing → requireProductIdentity fills "general"; allow up to identity max (80).
  category: z.string().trim().max(80).optional(),
});
export type ProductRequest = z.infer<typeof ProductRequestSchema>;

export function productFromRequest(p: ProductRequest): ProductIdentity {
  return requireProductIdentity(p);
}

/** Normalize blank identity fields; throws product_identity_incomplete when unrecoverable. */
export function requireProductIdentity(raw: unknown): ProductIdentity {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim()
      : typeof obj.searchTerm === "string" && obj.searchTerm.trim()
        ? obj.searchTerm.trim()
        : "";
  const searchTerm =
    typeof obj.searchTerm === "string" && obj.searchTerm.trim()
      ? obj.searchTerm.trim()
      : name;
  const category =
    typeof obj.category === "string" && obj.category.trim() ? obj.category.trim() : "general";

  if (!name || !searchTerm) {
    const err = new Error("product_identity_incomplete");
    (err as Error & { statusCode?: number; code?: string }).statusCode = 422;
    (err as Error & { code?: string }).code = "product_identity_incomplete";
    throw err;
  }

  return ProductIdentitySchema.parse({
    name: name.slice(0, 200),
    brand: typeof obj.brand === "string" ? obj.brand : obj.brand === null ? null : null,
    category: category.slice(0, 80),
    model: typeof obj.model === "string" ? obj.model : null,
    confidence: typeof obj.confidence === "number" ? obj.confidence : 0.5,
    searchTerm: searchTerm.slice(0, 200),
  });
}

/** Vision identify output - includes safety gate fields. */
export const IdentifyResultSchema = ProductIdentitySchema.extend({
  isProduct: z.boolean(),
  rejectReason: RejectReasonSchema.nullable(),
});
export type IdentifyResult = z.infer<typeof IdentifyResultSchema>;

export const ReportSourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  // LLM often omits type; freeform string (reddit, web, blog, …) not a closed enum.
  type: z.string().default("web"),
});

export const ConsensusReportSchema = z.object({
  verdict: z.enum(["buy", "wait", "avoid", "mixed"]),
  verdictLine: z.string(),
  score: z.number().min(0).max(100),
  consensus: z.string(),
  pros: z.array(z.string()),
  complaints: z.array(z.string()),
  longTermIssues: z.array(z.string()),
  commonFailures: z.array(z.string()),
  // ponytail: LLM tool output often drops these; coerceToSchema applies .default() before parse.
  fakeReviewSignal: z.object({
    level: z.enum(["low", "medium", "high", "unknown"]).default("unknown"),
    note: z.string().default(""),
  }),
  priceAnalysis: z.object({
    summary: z.string().default(""),
    trend: z.enum(["rising", "falling", "stable", "unknown"]).default("unknown"),
    shouldWaitForSale: z.boolean().default(false),
    reason: z.string().default(""),
  }),
  alternatives: z.array(z.object({ name: z.string(), why: z.string() })),
  buyingAdvice: z.string().default("Unable to summarize."),
  sources: z.array(ReportSourceSchema),
});
export type ConsensusReport = z.infer<typeof ConsensusReportSchema>;

// --- Deep-dive insights -----------------------------------------------------
// Each is fetched lazily/on-demand from the client, independent of the main
// report, so a slow or failed insight never blocks the core verdict.

export const LongTermScoreSchema = z.object({
  score: z.number().min(0).max(100),
  trend: z.enum(["improving", "declining", "stable", "mixed"]),
  timeline: z.array(
    z.object({
      period: z.string(),
      sentiment: z.enum(["positive", "negative", "mixed"]),
      note: z.string(),
    })
  ),
  summary: z.string(),
});
export type LongTermScore = z.infer<typeof LongTermScoreSchema>;

export const VersionHistorySchema = z.object({
  hasPreviousVersion: z.boolean(),
  previousVersion: z.string().nullable(),
  changes: z.array(
    z.object({
      aspect: z.string(),
      verdict: z.enum(["better", "worse", "same"]),
      note: z.string(),
    })
  ),
  worthUpgrading: z.enum(["yes", "no", "not_applicable"]),
  summary: z.string(),
});
export type VersionHistory = z.infer<typeof VersionHistorySchema>;

export const ScamDetectorSchema = z.object({
  riskLevel: z.enum(["low", "medium", "high"]),
  fakeReviewEstimatePercent: z.number().min(0).max(100).nullable(),
  counterfeitRisk: z.enum(["low", "medium", "high"]),
  redFlags: z.array(z.string()),
  summary: z.string(),
});
export type ScamDetector = z.infer<typeof ScamDetectorSchema>;

export const BestInCategorySchema = z.object({
  rank: z.string(),
  categoryScore: z.number().min(0).max(100),
  competitors: z.array(
    z.object({
      name: z.string(),
      comparison: z.enum(["better", "worse", "similar"]),
      note: z.string(),
    })
  ),
  summary: z.string(),
});
export type BestInCategory = z.infer<typeof BestInCategorySchema>;
