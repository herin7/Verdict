import assert from "node:assert/strict";
import {
  buildPriceCandidate,
  classifyPriceKind,
  nearestPriceLabelKind,
  parsePrice,
  payableFromEvidence,
  toReferencePrice,
} from "./normalize.js";

function testParseGroupedInr() {
  assert.equal(parsePrice("₹1,499", "INR").amount, 1499);
  assert.equal(parsePrice("₹1,24,999", "INR").amount, 124999);
  assert.equal(parsePrice("₹12,483 ratings", "INR").amount, null);
}

function testNearestLabelSameLine() {
  const ctx = "M.R.P.: ₹2,999 Deal Price ₹1,499";
  assert.equal(nearestPriceLabelKind(ctx, "₹2,999"), "original");
  assert.equal(nearestPriceLabelKind(ctx, "₹1,499"), "sale");
  assert.equal(classifyPriceKind(ctx, null, "₹2,999"), "original");
  assert.equal(classifyPriceKind(ctx, null, "₹1,499"), "sale");
}

function testWasNowSameLine() {
  const ctx = "Was ₹1,999 Now ₹999";
  assert.equal(classifyPriceKind(ctx, null, "₹1,999"), "original");
  assert.equal(classifyPriceKind(ctx, null, "₹999"), "sale");
  const sale = buildPriceCandidate({
    raw: "₹999",
    context: ctx,
    source: "screen_text",
    declaredCurrency: "INR",
  });
  assert.equal(sale.kind, "sale");
  assert.deepEqual(payableFromEvidence(sale), { amount: 999, currency: "INR" });
}

function testEmiNotSale() {
  const ctx = "₹14,990 EMI from ₹1,299/mo";
  assert.equal(classifyPriceKind(ctx, null, "₹14,990"), "unknown");
  assert.equal(classifyPriceKind(ctx, null, "₹1,299"), "emi");
  const emi = buildPriceCandidate({
    raw: "₹1,299",
    context: ctx,
    source: "screen_text",
    declaredCurrency: "INR",
  });
  assert.equal(emi.kind, "emi");
  assert.equal(payableFromEvidence(emi), null);
}

function testToReferenceRejectsMrpOnly() {
  assert.equal(toReferencePrice("₹2,999", "INR", "amazon_in", "INR", "M.R.P.: ₹2,999"), null);
}

function main() {
  testParseGroupedInr();
  testNearestLabelSameLine();
  testWasNowSameLine();
  testEmiNotSale();
  testToReferenceRejectsMrpOnly();
  console.log("normalize tests passed");
}

main();
