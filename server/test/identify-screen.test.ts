import assert from "node:assert/strict";
import { buildScreenTextRetryHint } from "../src/identify/llmFallback.js";
import type { ProductIdentity } from "../src/schema.js";

function product(overrides: Partial<ProductIdentity> = {}): ProductIdentity {
  return {
    name: "Sony WH-1000XM5",
    brand: "Sony",
    category: "headphones",
    model: "WH-1000XM5",
    confidence: 0.5,
    searchTerm: "Sony WH-1000XM5 headphones",
    ...overrides,
  };
}

function testRetriesWhenStrongSignalButLowConfidence() {
  const hint = buildScreenTextRetryHint({ asin: "B09XS7JWHH", hasBuyBox: true });
  const message = hint(product({ confidence: 0.5 }));
  assert.ok(message, "should return a corrective message when strong PDP evidence outweighs low confidence");
  assert.ok(message!.includes("B09XS7JWHH"), "corrective message should reference the detected ASIN");
}

function testNoRetryWhenAlreadyConfident() {
  const hint = buildScreenTextRetryHint({ asin: "B09XS7JWHH", hasBuyBox: true });
  const message = hint(product({ confidence: 0.85 }));
  assert.equal(message, null, "should not request a retry once confidence already clears the floor");
}

function testNoRetryWithoutAnyStrongSignal() {
  const hint = buildScreenTextRetryHint({});
  const message = hint(product({ confidence: 0.3 }));
  assert.equal(message, null, "should accept a low-confidence result as-is when there is no PDP evidence to weigh against it");
}

function testRetriesEmptyName() {
  const hint = buildScreenTextRetryHint({ hasBuyBox: true, hasBreadcrumb: true });
  const message = hint(product({ confidence: 0.2, name: "" }));
  assert.ok(message, "blank name must retry instead of being accepted");
  assert.ok(message!.toLowerCase().includes("empty") || message!.toLowerCase().includes("name"));
}

function main() {
  testRetriesWhenStrongSignalButLowConfidence();
  testNoRetryWhenAlreadyConfident();
  testNoRetryWithoutAnyStrongSignal();
  testRetriesEmptyName();
  console.log("identify-screen retryHint tests passed");
}

main();
