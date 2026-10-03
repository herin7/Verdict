/**
 * The buyer profile: onboarding answers stored as stable keys. The server
 * validates the same keys (server/src/profile/schema.ts) and weighs every
 * verdict against them; this file owns how they're asked and shown.
 */

export type Worth = "built_to_last" | "best_value" | "feels_premium" | "best_performance" | "simple_reliable" | "looks_beautiful";
export type Priority = "reliability" | "performance" | "comfort" | "design" | "battery" | "privacy" | "ease_of_use" | "after_sales";
export type Regret =
  | "poor_build"
  | "bad_battery"
  | "poor_value"
  | "annoying_software"
  | "high_maintenance"
  | "weak_support"
  | "poor_longevity"
  | "hidden_costs";
export type SpendStyle = "budget_first" | "balanced" | "quality_first" | "buy_the_best";
export type Lifespan = "1_2_years" | "3_4_years" | "5_plus_years" | "as_long_as_possible";
export type Friction = "just_works" | "some_setup" | "tinkerer";
export type Novelty = "proven" | "mostly_proven" | "open" | "mostly_new" | "experimental";
export type CalibrationId = "brand_trust" | "refurbished" | "wait_for_next" | "ecosystem";

export interface BuyerProfile {
  version: 1;
  worth: Worth[];
  worseMistake: "overpaying" | "buying_twice";
  spendStyle: SpendStyle;
  lifespan: Lifespan;
  /** Ranked: index 0 matters most. */
  nonNegotiables: Priority[];
  friction: Friction;
  novelty: Novelty;
  regrets: Regret[];
  calibration: Partial<Record<CalibrationId, string>>;
}

type Option<K extends string> = { key: K; label: string };

/** One screen each, in this order. `field` is where the answer lands in BuyerProfile. */
export const QUESTIONS = [
  {
    field: "worth",
    kind: "multi",
    title: "What makes something worth buying to you?",
    hint: "Pick up to 3",
    options: [
      { key: "built_to_last", label: "Built to last" },
      { key: "best_value", label: "Best value" },
      { key: "feels_premium", label: "Feels premium" },
      { key: "best_performance", label: "Best performance" },
      { key: "simple_reliable", label: "Simple & reliable" },
      { key: "looks_beautiful", label: "Looks beautiful" },
    ] satisfies Option<Worth>[],
  },
  {
    field: "worseMistake",
    kind: "single",
    title: "Which mistake annoys you more?",
    options: [
      { key: "overpaying", label: "Paying too much" },
      { key: "buying_twice", label: "Buying twice" },
    ] satisfies Option<BuyerProfile["worseMistake"]>[],
  },
  {
    field: "spendStyle",
    kind: "slider",
    title: "How do you usually buy?",
    options: [
      { key: "budget_first", label: "Budget first" },
      { key: "balanced", label: "Balanced" },
      { key: "quality_first", label: "Quality first" },
      { key: "buy_the_best", label: "Buy the best" },
    ] satisfies Option<SpendStyle>[],
  },
  {
    field: "lifespan",
    kind: "single",
    title: "How long should a good product stay good?",
    options: [
      { key: "1_2_years", label: "1–2 years" },
      { key: "3_4_years", label: "3–4 years" },
      { key: "5_plus_years", label: "5+ years" },
      { key: "as_long_as_possible", label: "As long as possible" },
    ] satisfies Option<Lifespan>[],
  },
  {
    field: "nonNegotiables",
    kind: "rank",
    title: "What are you least willing to compromise on?",
    hint: "Tap your top 3, most important first",
    options: [
      { key: "reliability", label: "Reliability" },
      { key: "performance", label: "Performance" },
      { key: "comfort", label: "Comfort" },
      { key: "design", label: "Design" },
      { key: "battery", label: "Battery" },
      { key: "privacy", label: "Privacy" },
      { key: "ease_of_use", label: "Ease of use" },
      { key: "after_sales", label: "After-sales support" },
    ] satisfies Option<Priority>[],
  },
  {
    field: "friction",
    kind: "single",
    title: "How much friction will you tolerate for a better product?",
    options: [
      { key: "just_works", label: "It should just work" },
      { key: "some_setup", label: "Some setup is fine" },
      { key: "tinkerer", label: "I don’t mind tinkering" },
    ] satisfies Option<Friction>[],
  },
  {
    field: "novelty",
    kind: "slider",
    title: "Proven products, or something new?",
    ends: ["Proven", "Experimental"],
    options: [
      { key: "proven", label: "Proven, always" },
      { key: "mostly_proven", label: "Mostly proven" },
      { key: "open", label: "Open to either" },
      { key: "mostly_new", label: "Happy to try new" },
      { key: "experimental", label: "First in line" },
    ] satisfies Option<Novelty>[],
  },
  {
    field: "regrets",
    kind: "multi",
    title: "What would make you regret a purchase?",
    hint: "Pick up to 3",
    options: [
      { key: "poor_build", label: "Poor build quality" },
      { key: "bad_battery", label: "Bad battery" },
      { key: "poor_value", label: "Poor value" },
      { key: "annoying_software", label: "Annoying software" },
      { key: "high_maintenance", label: "High maintenance" },
      { key: "weak_support", label: "Weak support" },
      { key: "poor_longevity", label: "Poor longevity" },
      { key: "hidden_costs", label: "Hidden costs" },
    ] satisfies Option<Regret>[],
  },
] as const;

export type Question = (typeof QUESTIONS)[number];

/** Asked one at a time, now and then, under a finished verdict. Never during onboarding. */
export const CALIBRATION: { id: CalibrationId; title: string; options: Option<string>[] }[] = [
  {
    id: "brand_trust",
    title: "Does a brand’s reputation sway you?",
    options: [
      { key: "a_lot", label: "A lot" },
      { key: "a_little", label: "A little" },
      { key: "not_at_all", label: "Not at all" },
    ],
  },
  {
    id: "refurbished",
    title: "Would you buy refurbished or open-box to save?",
    options: [
      { key: "yes", label: "Happily" },
      { key: "if_warrantied", label: "With a warranty" },
      { key: "never", label: "Never" },
    ],
  },
  {
    id: "wait_for_next",
    title: "If a new model is a few months away, do you wait?",
    options: [
      { key: "wait", label: "I wait" },
      { key: "buy_now", label: "I buy what I need now" },
    ],
  },
  {
    id: "ecosystem",
    title: "How much does fitting with gear you already own matter?",
    options: [
      { key: "a_lot", label: "A lot" },
      { key: "somewhat", label: "Somewhat" },
      { key: "not_much", label: "Not much" },
    ],
  },
];

const allOptions: Record<string, string> = Object.fromEntries(
  QUESTIONS.flatMap((q) => q.options.map((o) => [o.key, o.label] as const))
);

/** Human label for a factor the server cites in a personal verdict. */
export function factorLabel(factor: string): string {
  const single: Record<string, string> = {
    spend_style: "How you spend",
    lifespan: "How long it should last",
    friction: "Setup & upkeep",
    novelty: "Proven vs. new",
  };
  return single[factor] ?? allOptions[factor] ?? factor.replace(/_/g, " ");
}

export const labelOf = (key: string) => allOptions[key] ?? key;

/**
 * A few plain traits that read back what they told us - no scores. The last
 * one is always about which mistake they'd rather avoid.
 */
export function buyerDna(p: BuyerProfile): string[] {
  const spend = { budget_first: "Budget-first", balanced: "Balanced spender", quality_first: "Quality-first", buy_the_best: "Buys the best" }[
    p.spendStyle
  ];
  const upkeep =
    p.friction === "tinkerer"
      ? "Happy to tinker"
      : p.friction === "just_works" || p.regrets.includes("high_maintenance")
        ? "Low-maintenance"
        : null;
  const durable =
    p.lifespan === "5_plus_years" ||
    p.lifespan === "as_long_as_possible" ||
    p.worth.includes("built_to_last") ||
    p.regrets.includes("poor_longevity")
      ? "Durability-sensitive"
      : p.lifespan === "1_2_years"
        ? "Upgrades often"
        : null;
  const novelty = p.novelty === "proven" || p.novelty === "mostly_proven" ? "Proven over new" : p.novelty === "open" ? null : "Early adopter";
  const first = p.nonNegotiables[0] ? `${labelOf(p.nonNegotiables[0])} first` : null;
  const mistake =
    p.worseMistake === "buying_twice"
      ? p.spendStyle === "budget_first"
        ? "Buys once, buys right"
        : "Will pay more to get it right"
      : "Won’t overpay for a name";

  const traits = [spend, upkeep, durable, novelty, first].filter((t): t is string => Boolean(t)).slice(0, 3);
  return [...traits, mistake];
}
