import assert from "node:assert/strict";
import test from "node:test";
import { reconcile, type PersonalVerdict } from "../src/profile/personalize.js";
import { BuyerProfileSchema, factorsFor, isDealBreaker, profileBrief } from "../src/profile/schema.js";

const profile = BuyerProfileSchema.parse({
  version: 1,
  worth: ["built_to_last", "simple_reliable"],
  worseMistake: "buying_twice",
  spendStyle: "quality_first",
  lifespan: "5_plus_years",
  nonNegotiables: ["reliability", "battery", "comfort"],
  friction: "just_works",
  novelty: "proven",
  regrets: ["high_maintenance", "poor_build"],
});

const verdict = (v: Partial<PersonalVerdict>): PersonalVerdict => ({ verdict: "buy", headline: "", matches: [], conflicts: [], ...v });
const conflict = (factor: string, strength: "strong" | "minor") => ({ factor, text: "x", sources: [1], strength });

test("deal-breakers are regrets and the top two non-negotiables", () => {
  assert.equal(isDealBreaker(profile, "reliability"), true);
  assert.equal(isDealBreaker(profile, "battery"), true);
  assert.equal(isDealBreaker(profile, "comfort"), false); // ranked third
  assert.equal(isDealBreaker(profile, "high_maintenance"), true);
  assert.equal(isDealBreaker(profile, "design"), false);
  assert.ok(factorsFor(profile).includes("lifespan"));
  assert.ok(!factorsFor(profile).includes("privacy"));
});

test("strong conflicts on deal-breakers cap the verdict", () => {
  assert.equal(reconcile(verdict({ conflicts: [conflict("battery", "strong")] }), profile).verdict, "depends");
  assert.equal(
    reconcile(verdict({ conflicts: [conflict("battery", "strong"), conflict("poor_build", "strong")] }), profile).verdict,
    "skip"
  );
  // minor evidence, or a factor that isn't a deal-breaker, leaves the model's call alone
  assert.equal(reconcile(verdict({ conflicts: [conflict("battery", "minor")] }), profile).verdict, "buy");
  assert.equal(reconcile(verdict({ conflicts: [conflict("comfort", "strong")] }), profile).verdict, "buy");
  // the same factor twice is one deal-breaker, not two
  assert.equal(
    reconcile(verdict({ conflicts: [conflict("battery", "strong"), conflict("battery", "strong")] }), profile).verdict,
    "depends"
  );
});

test("the profile reaches the model in ranked order", () => {
  assert.match(profileBrief(profile), /most important first\): reliability, battery, comfort/);
  assert.equal(BuyerProfileSchema.safeParse({ ...profile, regrets: ["poor_build", "poor_build"] }).success, false);
  assert.equal(BuyerProfileSchema.safeParse({ ...profile, worth: [] }).success, false);
});
