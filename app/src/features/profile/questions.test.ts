import assert from "node:assert/strict";
import test from "node:test";
import { buyerDna, factorLabel, type BuyerProfile } from "./questions";

const base: BuyerProfile = {
  version: 1,
  worth: ["simple_reliable"],
  worseMistake: "buying_twice",
  spendStyle: "quality_first",
  lifespan: "5_plus_years",
  nonNegotiables: ["reliability", "battery"],
  friction: "just_works",
  novelty: "open",
  regrets: ["poor_build"],
  calibration: {},
};

test("buyer DNA reads back the answers", () => {
  assert.deepEqual(buyerDna(base), ["Quality-first", "Low-maintenance", "Durability-sensitive", "Will pay more to get it right"]);
  assert.deepEqual(buyerDna({ ...base, spendStyle: "budget_first", friction: "tinkerer", lifespan: "1_2_years", worseMistake: "overpaying" }), [
    "Budget-first",
    "Happy to tinker",
    "Upgrades often",
    "Won’t overpay for a name",
  ]);
  // never more than four traits, the mistake always last
  assert.equal(buyerDna({ ...base, novelty: "experimental" }).length, 4);
});

test("server factors get human labels", () => {
  assert.equal(factorLabel("after_sales"), "After-sales support");
  assert.equal(factorLabel("lifespan"), "How long it should last");
});
