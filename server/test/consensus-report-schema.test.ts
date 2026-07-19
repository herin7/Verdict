/**
 * Incomplete consensus_report tool payloads must parse after coerceToSchema
 * (anthropic/bedrock path) — missing optional-ish fields get schema defaults.
 */
import assert from "node:assert/strict";
import { coerceToSchema } from "../src/coerce.js";
import { ConsensusReportSchema } from "../src/schema.js";

const incomplete = {
  verdict: "mixed",
  verdictLine: "Mixed signal across sources.",
  score: 55,
  consensus: "Some praise comfort; others cite durability.",
  pros: ["Comfortable"],
  complaints: ["Build quality"],
  longTermIssues: [],
  commonFailures: [],
  // omit fakeReviewSignal, priceAnalysis, buyingAdvice entirely (device log case)
  alternatives: [],
  sources: [{ title: "Some thread", url: "https://example.com/x" }],
};

const coerced = coerceToSchema(ConsensusReportSchema, incomplete);
const parsed = ConsensusReportSchema.safeParse(coerced);

assert(parsed.success, `incomplete report must parse:\n${parsed.success ? "" : parsed.error.message}`);

const report = parsed.data;
assert.equal(report.fakeReviewSignal.level, "unknown");
assert.equal(report.fakeReviewSignal.note, "");
assert.equal(report.priceAnalysis.trend, "unknown");
assert.equal(report.priceAnalysis.shouldWaitForSale, false);
assert.equal(report.priceAnalysis.summary, "");
assert.equal(report.priceAnalysis.reason, "");
assert.equal(report.buyingAdvice, "Unable to summarize.");
assert.equal(report.sources[0]?.type, "web");

console.log("consensus-report-schema: ok");
