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

export interface BuyLink {
  retailer: string;
  url: string;
  title: string;
}

export interface ConsensusReport {
  verdict: "buy" | "wait" | "avoid" | "mixed";
  verdictLine: string;
  score: number;
  consensus: string;
  pros: string[];
  complaints: string[];
  longTermIssues: string[];
  commonFailures: string[];
  fakeReviewSignal: { level: "low" | "medium" | "high" | "unknown"; note: string };
  priceAnalysis: {
    summary: string;
    trend: "rising" | "falling" | "stable" | "unknown";
    shouldWaitForSale: boolean;
    reason: string;
  };
  alternatives: { name: string; why: string }[];
  buyingAdvice: string;
  sources: ReportSource[];
}

export interface SavedReport {
  id: string;
  savedAt: number;
  product: ProductIdentity;
  report: ConsensusReport;
  buyLinks: BuyLink[];
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
