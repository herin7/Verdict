export interface ProductIdentity {
  name: string;
  brand: string | null;
  category: string;
  model: string | null;
  confidence: number;
  searchTerm: string;
}

export interface ReportSource {
  title: string;
  url: string;
  type: string;
}

/** A claim plus the 1-based numbers of the sources that back it. */
export interface CitedPoint {
  text: string;
  sources: number[];
}

export type Verdict = "buy" | "skip" | "depends";

/** The evidence-backed verdict (server schemaVersion 3). */
export interface ConsensusReport {
  schemaVersion: 3;
  verdict: Verdict;
  verdictLine: string;
  summary: string;
  bestFor: string[];
  notFor: string[];
  keySpecs: { label: string; value: string }[];
  pros: CitedPoint[];
  cons: CitedPoint[];
  recurringIssues: (CitedPoint & { frequency: "common" | "occasional" | "rare" })[];
  risks: (CitedPoint & { severity: "low" | "medium" | "high" })[];
  fakeReviewRisk: { level: "low" | "medium" | "high" | "unknown"; note: string };
  alternatives: { name: string; why: string }[];
  buyingAdvice: string;
  sources: ReportSource[];
}

// --- Deep-dive insights (fetched lazily, one endpoint call per card) -------

export type InsightType = "long-term" | "version-history" | "scam-detector" | "best-in-category";

export interface LongTermScore {
  score: number;
  trend: "improving" | "declining" | "stable" | "mixed";
  timeline: { period: string; sentiment: "positive" | "negative" | "mixed"; note: string }[];
  summary: string;
}

export interface VersionHistory {
  hasPreviousVersion: boolean;
  previousVersion: string | null;
  changes: { aspect: string; verdict: "better" | "worse" | "same"; note: string }[];
  worthUpgrading: "yes" | "no" | "not_applicable";
  summary: string;
}

export interface ScamDetector {
  riskLevel: "low" | "medium" | "high";
  fakeReviewEstimatePercent: number | null;
  counterfeitRisk: "low" | "medium" | "high";
  redFlags: string[];
  summary: string;
}

export interface BestInCategory {
  rank: string;
  categoryScore: number;
  competitors: { name: string; comparison: "better" | "worse" | "similar"; note: string }[];
  summary: string;
}

/** A buyer-profile factor touched by a piece of report evidence. */
export interface FactorPoint extends CitedPoint {
  factor: string;
}

/** The report weighed against this user's buyer profile (server profile/personalize.ts). */
export interface PersonalVerdict {
  verdict: Verdict;
  headline: string;
  matches: FactorPoint[];
  conflicts: (FactorPoint & { strength: "strong" | "minor" })[];
}
