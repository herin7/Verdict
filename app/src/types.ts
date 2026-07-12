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
