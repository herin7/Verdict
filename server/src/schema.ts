import { z } from "zod";

export const ProductIdentitySchema = z.object({
  name: z.string(),
  brand: z.string().nullable(),
  category: z.string(),
  model: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  searchTerm: z.string(),
});
export type ProductIdentity = z.infer<typeof ProductIdentitySchema>;

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
