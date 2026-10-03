import { z } from "zod";
import { runWorkload } from "../ai/gateway.js";
import type { ToolSpec } from "../ai/types.js";
import type { ConsensusReport, ProductIdentity } from "../schema.js";
import { factorsFor, isDealBreaker, profileBrief, type BuyerProfile, type ProfileFactor } from "./schema.js";

const Point = z.object({
  /** Which of the buyer's answers this touches. */
  factor: z.string(),
  /** The evidence, in a few words. */
  text: z.string(),
  /** 1-based indexes into report.sources, same numbering as the report. */
  sources: z.array(z.number().int()).default([]),
});

export const PersonalVerdictSchema = z.object({
  verdict: z.enum(["buy", "skip", "depends"]),
  /** One sentence to this buyer, naming the priorities that decided it. */
  headline: z.string(),
  /** Evidence that lines up with what they care about. */
  matches: z.array(Point).default([]),
  /** Evidence that works against what they care about. */
  conflicts: z.array(Point.extend({ strength: z.enum(["strong", "minor"]).default("minor") })).default([]),
});
export type PersonalVerdict = z.infer<typeof PersonalVerdictSchema>;

/**
 * Report (same for everyone) + buyer profile (this user) → this user's verdict.
 *
 * The model maps the report's cited evidence onto the buyer's own answers;
 * `reconcile` then guarantees their deal-breakers are honoured, so the same
 * product can be a BUY for one person and a SKIP for another.
 */
export async function personalizeVerdict(
  product: ProductIdentity,
  report: ConsensusReport,
  profile: BuyerProfile
): Promise<PersonalVerdict> {
  const factors = factorsFor(profile);
  const point = (extra: Record<string, unknown> = {}, required: string[] = []) => ({
    type: "array",
    items: {
      type: "object",
      properties: {
        factor: { type: "string", enum: factors, description: "The buyer answer this evidence touches." },
        text: { type: "string", description: "The evidence from the report, under 12 words." },
        sources: { type: "array", items: { type: "integer" }, description: "Source numbers from the report claim you used." },
        ...extra,
      },
      required: ["factor", "text", "sources", ...required],
    },
  });

  const tool: ToolSpec = {
    name: "personal_verdict",
    description: "Decide whether this specific buyer should buy the product, based on their profile and the report's evidence.",
    inputSchema: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["buy", "skip", "depends"] },
        headline: {
          type: "string",
          description:
            "One sentence to the buyer, max ~18 words, naming the priorities that decided it. e.g. 'Battery life and reliability line up with what you care about most.'",
        },
        matches: { ...point(), description: "Max 3. Report evidence that satisfies one of the buyer's factors." },
        conflicts: {
          ...point({
            strength: {
              type: "string",
              enum: ["strong", "minor"],
              description: "strong = common/serious and well sourced; minor = occasional, mild or thinly sourced.",
            },
          }, ["strength"]),
          description: "Max 3. Report evidence that works against one of the buyer's factors.",
        },
      },
      required: ["verdict", "headline", "matches", "conflicts"],
    },
  };

  const result = await runWorkload<PersonalVerdict>({
    workload: "personalize",
    schema: PersonalVerdictSchema,
    tool,
    maxTokens: 800,
    maxAttempts: 2,
    normalize: (raw) => ({ matches: [], conflicts: [], ...(raw as Record<string, unknown>) }),
    retryHint: (data) => {
      const fixed = reconcile(data, profile);
      return fixed.verdict === data.verdict
        ? null
        : `You listed strong evidence against the buyer's deal-breakers (${dealBreakers(data, profile).join(", ")}) but said "${data.verdict}". Reconsider: with one such conflict the verdict can be at most "depends"; with two or more it is "skip".`;
    },
    system: [
      "You turn a general product report into a verdict for ONE buyer, using their profile.",
      "Judge only on evidence in the report. Never invent facts; cite the same source numbers the report gives.",
      "Weigh what this buyer said matters: their non-negotiables (ranked) and regrets weigh most; spending style, durability expectation, friction tolerance and appetite for new tech shape the call.",
      "Your verdict may differ from the general one - that is the point. A great product that fails this buyer's priorities is a skip for them.",
      "If the report says nothing about one of their top priorities, say so in the headline rather than guessing.",
      "Write the headline in second person, plain words, no marketing.",
    ].join(" "),
    messages: [{ role: "user", content: `BUYER PROFILE\n${profileBrief(profile)}\n\n${reportBrief(product, report)}` }],
  });

  return reconcile(clean(result.data, factors, report.sources.length), profile);
}

/** Strong conflicts on the buyer's deal-breakers cap the verdict: one → at most depends, two → skip. */
export function reconcile(v: PersonalVerdict, profile: BuyerProfile): PersonalVerdict {
  const n = dealBreakers(v, profile).length;
  if (n >= 2) return { ...v, verdict: "skip" };
  if (n === 1 && v.verdict === "buy") return { ...v, verdict: "depends" };
  return v;
}

function dealBreakers(v: PersonalVerdict, profile: BuyerProfile): string[] {
  return [
    ...new Set(
      v.conflicts.filter((c) => c.strength === "strong" && isDealBreaker(profile, c.factor as ProfileFactor)).map((c) => c.factor)
    ),
  ];
}

/** Drops points about factors the buyer never chose and citations that point nowhere. */
function clean(v: PersonalVerdict, factors: string[], sourceCount: number): PersonalVerdict {
  const keep = <T extends { factor: string; sources: number[] }>(items: T[]) =>
    items
      .filter((i) => factors.includes(i.factor))
      .slice(0, 3)
      .map((i) => ({ ...i, sources: [...new Set(i.sources)].filter((s) => s >= 1 && s <= sourceCount) }));
  return { ...v, matches: keep(v.matches), conflicts: keep(v.conflicts) };
}

/** The report's claims, numbered as in the report, so the model can cite them back. */
function reportBrief(product: ProductIdentity, r: ConsensusReport): string {
  const cites = (s: number[]) => (s.length ? ` [${s.join(",")}]` : "");
  const list = (title: string, items: { text: string; sources: number[] }[], tag?: (i: number) => string) =>
    items.length ? `${title}\n${items.map((i, n) => `- ${i.text}${tag ? ` (${tag(n)})` : ""}${cites(i.sources)}`).join("\n")}` : "";
  return [
    `PRODUCT: ${product.name} (${product.brand ?? "unknown brand"}, ${product.category})`,
    `GENERAL VERDICT: ${r.verdict} - ${r.verdictLine}`,
    r.summary && `SUMMARY: ${r.summary}`,
    r.bestFor.length && `BEST FOR: ${r.bestFor.join("; ")}`,
    r.notFor.length && `NOT FOR: ${r.notFor.join("; ")}`,
    r.keySpecs.length && `SPECS: ${r.keySpecs.map((s) => `${s.label}: ${s.value}`).join("; ")}`,
    list("PROS", r.pros),
    list("CONS", r.cons),
    list("RECURRING ISSUES", r.recurringIssues, (n) => r.recurringIssues[n].frequency),
    list("RISKS", r.risks, (n) => `${r.risks[n].severity} severity`),
    r.alternatives.length && `ALTERNATIVES: ${r.alternatives.map((a) => `${a.name} (${a.why})`).join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
