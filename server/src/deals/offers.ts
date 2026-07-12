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

export type OfferRuleType = "percent_off" | "flat_cashback" | "coupon" | "membership_perk";

export interface OfferRule {
  id: string;
  label: string;
  marketplaces: string[] | "*";
  methods: PaymentMethodId[];
  type: OfferRuleType;
  /** Percent off (0-100) or flat INR amount depending on type */
  value: number;
  /** Cap on absolute discount in INR */
  cap?: number;
  /** Min cart value */
  minCart?: number;
  validFrom?: string; // ISO date
  validTo?: string;
  stackable?: boolean;
}

export const PAYMENT_CATALOG: {
  id: PaymentMethodId;
  label: string;
  kind: "card" | "wallet" | "membership";
}[] = [
  { id: "hdfc_cc", label: "HDFC Credit Card", kind: "card" },
  { id: "sbi_cc", label: "SBI Credit Card", kind: "card" },
  { id: "icici_cc", label: "ICICI Credit Card", kind: "card" },
  { id: "axis_cc", label: "Axis Credit Card", kind: "card" },
  { id: "amex", label: "American Express", kind: "card" },
  { id: "amazon_pay", label: "Amazon Pay", kind: "wallet" },
  { id: "flipkart_axis", label: "Flipkart Axis Card", kind: "card" },
  { id: "gpay", label: "Google Pay", kind: "wallet" },
  { id: "phonepe", label: "PhonePe", kind: "wallet" },
  { id: "paytm", label: "Paytm", kind: "wallet" },
  { id: "cred", label: "CRED", kind: "wallet" },
  { id: "amazon_prime", label: "Amazon Prime", kind: "membership" },
  { id: "flipkart_plus", label: "Flipkart Plus", kind: "membership" },
];

/** Curated India offers ruleset - update periodically; zero LLM cost. */
export const OFFER_RULES: OfferRule[] = [
  {
    id: "amazon_hdfc_10",
    label: "10% Instant Discount with HDFC",
    marketplaces: ["amazon_in"],
    methods: ["hdfc_cc"],
    type: "percent_off",
    value: 10,
    cap: 1500,
    minCart: 2000,
  },
  {
    id: "amazon_icici_10",
    label: "10% Instant Discount with ICICI",
    marketplaces: ["amazon_in"],
    methods: ["icici_cc"],
    type: "percent_off",
    value: 10,
    cap: 1250,
    minCart: 2000,
  },
  {
    id: "flipkart_axis_5",
    label: "5% Cashback Flipkart Axis",
    marketplaces: ["flipkart"],
    methods: ["flipkart_axis"],
    type: "percent_off",
    value: 5,
    cap: 1000,
  },
  {
    id: "flipkart_sbi_10",
    label: "10% Instant Discount SBI",
    marketplaces: ["flipkart"],
    methods: ["sbi_cc"],
    type: "percent_off",
    value: 10,
    cap: 1500,
    minCart: 2500,
  },
  {
    id: "amazon_pay_cashback",
    label: "Amazon Pay ₹100 cashback",
    marketplaces: ["amazon_in"],
    methods: ["amazon_pay"],
    type: "flat_cashback",
    value: 100,
    minCart: 999,
  },
  {
    id: "cred_cashback",
    label: "CRED coin cashback ~2%",
    marketplaces: "*",
    methods: ["cred"],
    type: "percent_off",
    value: 2,
    cap: 500,
  },
  {
    id: "phonepe_flat",
    label: "PhonePe ₹75 cashback",
    marketplaces: ["flipkart", "myntra", "ajio"],
    methods: ["phonepe"],
    type: "flat_cashback",
    value: 75,
    minCart: 750,
  },
  {
    id: "gpay_flat",
    label: "Google Pay ₹50 cashback",
    marketplaces: "*",
    methods: ["gpay"],
    type: "flat_cashback",
    value: 50,
    minCart: 500,
  },
  {
    id: "prime_shipping",
    label: "Prime free shipping",
    marketplaces: ["amazon_in"],
    methods: ["amazon_prime"],
    type: "membership_perk",
    value: 40,
  },
  {
    id: "fk_plus_shipping",
    label: "Plus free shipping",
    marketplaces: ["flipkart"],
    methods: ["flipkart_plus"],
    type: "membership_perk",
    value: 40,
  },
  {
    id: "croma_hdfc",
    label: "Croma HDFC 7.5% off",
    marketplaces: ["croma"],
    methods: ["hdfc_cc"],
    type: "percent_off",
    value: 7.5,
    cap: 3000,
    minCart: 5000,
  },
  {
    id: "nykaa_icici",
    label: "Nykaa ICICI 10% off",
    marketplaces: ["nykaa"],
    methods: ["icici_cc"],
    type: "percent_off",
    value: 10,
    cap: 800,
    minCart: 1500,
  },
];

export function isRuleActive(rule: OfferRule, now = new Date()): boolean {
  if (rule.validFrom && now < new Date(rule.validFrom)) return false;
  if (rule.validTo && now > new Date(rule.validTo)) return false;
  return true;
}
