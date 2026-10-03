import { z } from "zod";

/**
 * The buyer profile: onboarding answers, stored verbatim as stable keys.
 * The app owns the wording of the questions; the server only needs the keys,
 * which read plainly enough to hand straight to the model (see profileBrief).
 *
 * Keep these lists in sync with app/src/features/profile/questions.ts.
 */
export const WORTH = ["built_to_last", "best_value", "feels_premium", "best_performance", "simple_reliable", "looks_beautiful"] as const;
export const PRIORITIES = ["reliability", "performance", "comfort", "design", "battery", "privacy", "ease_of_use", "after_sales"] as const;
export const REGRETS = [
  "poor_build",
  "bad_battery",
  "poor_value",
  "annoying_software",
  "high_maintenance",
  "weak_support",
  "poor_longevity",
  "hidden_costs",
] as const;
export const SPEND_STYLES = ["budget_first", "balanced", "quality_first", "buy_the_best"] as const;
export const LIFESPANS = ["1_2_years", "3_4_years", "5_plus_years", "as_long_as_possible"] as const;
export const FRICTION = ["just_works", "some_setup", "tinkerer"] as const;
export const NOVELTY = ["proven", "mostly_proven", "open", "mostly_new", "experimental"] as const;

/** Optional questions asked now and then after a verdict, never during onboarding. */
export const CALIBRATION = ["brand_trust", "refurbished", "wait_for_next", "ecosystem"] as const;

const upTo3 = <T extends readonly [string, ...string[]]>(values: T) =>
  z.array(z.enum(values)).min(1).max(3).refine((a) => new Set(a).size === a.length, "Duplicate answer");

export const BuyerProfileSchema = z.object({
  version: z.literal(1),
  /** Q1 - what makes something worth buying (up to 3). */
  worth: upTo3(WORTH),
  /** Q2 - the mistake that annoys them more. */
  worseMistake: z.enum(["overpaying", "buying_twice"]),
  /** Q3 - budget first → buy the best. */
  spendStyle: z.enum(SPEND_STYLES),
  /** Q4 - how long a good product should stay good. */
  lifespan: z.enum(LIFESPANS),
  /** Q5 - least willing to compromise on, ranked: index 0 matters most. */
  nonNegotiables: upTo3(PRIORITIES),
  /** Q6 - friction tolerated for a better product. */
  friction: z.enum(FRICTION),
  /** Q7 - proven ↔ experimental. */
  novelty: z.enum(NOVELTY),
  /** Q8 - what would make them regret a purchase (up to 3). */
  regrets: upTo3(REGRETS),
  /** Later, optional answers. Values are short option keys chosen in the app. */
  calibration: z.partialRecord(z.enum(CALIBRATION), z.string().trim().min(1).max(40)).default({}),
});
export type BuyerProfile = z.infer<typeof BuyerProfileSchema>;

/**
 * What a personal verdict can point at: one of the buyer's own answers.
 * Multi-select answers are referenced by their key; single answers by the
 * question name, so "lifespan" means "their durability expectation".
 */
export type ProfileFactor = (typeof WORTH)[number] | (typeof PRIORITIES)[number] | (typeof REGRETS)[number] | "spend_style" | "lifespan" | "friction" | "novelty";

/** The factors this particular buyer cares about - the only ones a verdict may cite. */
export function factorsFor(p: BuyerProfile): ProfileFactor[] {
  return [...new Set<ProfileFactor>([...p.nonNegotiables, ...p.regrets, ...p.worth, "spend_style", "lifespan", "friction", "novelty"])];
}

/**
 * A factor is a deal-breaker when the buyer named it as a regret or as one of
 * their top two non-negotiables. Strong evidence against one of these can't
 * end in a BUY (see reconcile in personalize.ts).
 */
export function isDealBreaker(p: BuyerProfile, factor: ProfileFactor): boolean {
  return (p.regrets as string[]).includes(factor) || (p.nonNegotiables.slice(0, 2) as string[]).includes(factor);
}

/** The profile as plain lines for the model. Ranked lists keep their order. */
export function profileBrief(p: BuyerProfile): string {
  const lines = [
    `Least willing to compromise on (most important first): ${p.nonNegotiables.join(", ")}`,
    `Would regret a purchase because of: ${p.regrets.join(", ")}`,
    `Worth buying means: ${p.worth.join(", ")}`,
    `Mistake that annoys them more: ${p.worseMistake === "overpaying" ? "paying too much" : "buying twice (cheap thing fails, buy again)"}`,
    `Spending style: ${p.spendStyle}`,
    `Expects a good product to stay good for: ${p.lifespan}`,
    `Tolerance for setup/tinkering: ${p.friction}`,
    `Proven vs new: ${p.novelty}`,
  ];
  for (const [question, answer] of Object.entries(p.calibration)) lines.push(`${question}: ${answer}`);
  return lines.map((l) => `- ${l}`).join("\n");
}
