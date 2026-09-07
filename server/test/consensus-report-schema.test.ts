/**
 * The report tool output is often incomplete; coerceToSchema + defaults must
 * still yield a valid v2 report, and citations must only point at real sources.
 */
import assert from "node:assert/strict";
import { coerceToSchema } from "../src/coerce.js";
import { ConsensusReportSchema, clampCitations } from "../src/schema.js";

const incomplete = {
  verdict: "depends",
  verdictLine: "Great sound, shaky durability.",
  pros: [{ text: "Comfortable for long sessions", sources: [1, 2] }],
  cons: [{ text: "Hinge cracks", sources: [2, 9, 2] }],
  recurringIssues: [{ text: "Left earcup cuts out", sources: [0, 3] }],
  // summary, bestFor, notFor, keySpecs, risks, fakeReviewRisk, alternatives, buyingAdvice omitted
};

const coerced = coerceToSchema(ConsensusReportSchema, incomplete);
const parsed = ConsensusReportSchema.safeParse(coerced);
assert(parsed.success, `incomplete report must parse:\n${parsed.success ? "" : parsed.error.message}`);

const report = parsed.data;
assert.equal(report.schemaVersion, 3);
assert.equal(report.fakeReviewRisk.level, "unknown");
assert.deepEqual(report.bestFor, []);
assert.deepEqual(report.keySpecs, []);
assert.equal(report.recurringIssues[0]?.frequency, "occasional");
assert.equal(report.buyingAdvice, "Unable to summarize.");

const withSources = clampCitations({
  ...report,
  sources: [
    { title: "r/headphones thread", url: "https://reddit.com/r/headphones/x", type: "reddit" },
    { title: "Owner review", url: "https://example.com/review", type: "review" },
    { title: "Forum", url: "https://example.com/forum", type: "forum" },
  ],
});
assert.deepEqual(withSources.pros[0]?.sources, [1, 2]);
assert.deepEqual(withSources.cons[0]?.sources, [2], "out-of-range and duplicate citations are dropped");
assert.deepEqual(withSources.recurringIssues[0]?.sources, [3], "index 0 is not a valid 1-based citation");

console.log("consensus-report-schema: ok");
