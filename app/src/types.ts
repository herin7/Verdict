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
  price: string | null;
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
  productId?: string | null;
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

export type PaymentMethodId =
  | "hdfc_cc"
  | "sbi_cc"
  | "icici_cc"
  | "axis_cc"
  | "amex"
  | "amazon_pay"
  | "flipkart_axis"
  | "gpay"
  | "phonepe"
  | "paytm"
  | "cred"
  | "amazon_prime"
  | "flipkart_plus";

export interface PaymentCatalogItem {
  id: PaymentMethodId;
  label: string;
  kind: "card" | "wallet" | "membership";
}

export interface AppliedDeal {
  ruleId: string;
  label: string;
  method: PaymentMethodId;
  savings: number;
}

export interface RankedDeal {
  offer: MarketplaceOffer;
  listPrice: number;
  finalPayable: number;
  totalSavings: number;
  applied: AppliedDeal[];
  methodUsed: PaymentMethodId | null;
}
