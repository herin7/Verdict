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
  name: z.string(),
  brand: z.string().nullable(),
  category: z.string(),
  model: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  searchTerm: z.string(),
});
export type ProductIdentity = z.infer<typeof ProductIdentitySchema>;

/** Vision identify output - includes safety gate fields. */
export const IdentifyResultSchema = ProductIdentitySchema.extend({
  isProduct: z.boolean(),
  rejectReason: RejectReasonSchema.nullable(),
});
export type IdentifyResult = z.infer<typeof IdentifyResultSchema>;

export const ReportSourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  type: z.string(),
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
  fakeReviewSignal: z.object({
    level: z.enum(["low", "medium", "high", "unknown"]),
    note: z.string(),
  }),
  priceAnalysis: z.object({
    summary: z.string(),
    trend: z.enum(["rising", "falling", "stable", "unknown"]),
    shouldWaitForSale: z.boolean(),
    reason: z.string(),
  }),
  alternatives: z.array(z.object({ name: z.string(), why: z.string() })),
  buyingAdvice: z.string(),
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
