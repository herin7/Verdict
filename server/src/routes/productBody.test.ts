import assert from "node:assert/strict";
import { parseProductBody, softReference } from "./productBody.js";

const longCategory = "electronics headphones noise cancelling wireless over ear";
assert.ok(longCategory.length > 40 && longCategory.length <= 80, "fixture length");

{
  const r = parseProductBody({
    product: {
      name: "Sony WH-1000XM5",
      brand: "Sony",
      category: longCategory,
      model: null,
      confidence: 0.9,
      searchTerm: "Sony WH-1000XM5",
    },
    country: "IN",
    reference: { amount: 24990, currency: "INR", retailerId: "amazon_in" },
  });
  assert.ok(!("error" in r), `long category must pass: ${"error" in r ? r.details : ""}`);
  assert.equal(r.product.category, longCategory);
  assert.equal(r.reference?.amount, 24990);
}

{
  const r = parseProductBody({
    product: {
      name: "Sony WH-1000XM5",
      brand: "Sony",
      category: "a".repeat(81),
      model: null,
      confidence: 0.9,
      searchTerm: "Sony WH-1000XM5",
    },
    country: "IN",
  });
  assert.ok("error" in r, "category >80 must fail");
  assert.match(r.details, /category/i);
}

{
  const r = parseProductBody({
    product: {
      name: "Sony WH",
      brand: null,
      model: null,
      confidence: 0.8,
      searchTerm: "Sony WH",
    },
    country: "IN",
  });
  assert.ok(!("error" in r), `missing category ok: ${"error" in r ? r.details : ""}`);
  assert.equal(r.product.category, "general");
}

{
  const r = parseProductBody({
    product: {
      name: "Sony",
      brand: null,
      category: "headphones",
      model: null,
      confidence: 0.9,
      searchTerm: "Sony",
    },
    country: "IN",
    reference: { amount: 100, currency: "USD", retailerId: "amazon_in" },
  });
  assert.ok(!("error" in r), "currency mismatch must not 400 whole body");
  assert.equal(r.reference, null);
}

{
  const r = parseProductBody({
    product: {
      name: "Sony",
      brand: null,
      category: "headphones",
      model: null,
      confidence: 0.9,
      searchTerm: "Sony",
    },
    country: "IN",
    reference: { amount: 0, currency: "INR" },
  });
  assert.ok(!("error" in r), "invalid reference amount must not 400");
  assert.equal(r.reference, null);
}

{
  const r = parseProductBody({
    product: {
      name: "  ",
      brand: "Sony",
      category: "headphones",
      model: null,
      confidence: 0.9,
      searchTerm: "Sony",
    },
    country: "IN",
  });
  assert.ok("error" in r, "blank name must fail");
}

assert.equal(softReference({ amount: 10, currency: "INR" }, "IN")?.amount, 10);
assert.equal(softReference({ amount: 10, currency: "USD" }, "IN"), null);
assert.equal(softReference(null, "IN"), null);

{
  const r = parseProductBody({
    product: {
      name: "Sony WH-1000XM5",
      brand: "Sony",
      category: "headphones",
      model: null,
      confidence: 0.9,
      searchTerm: "Sony WH-1000XM5",
    },
    country: "IN",
    asin: "b09xs7jwhh",
    fsn: "MOBGTAGPTB3VS24W",
    flipkartItemId: "itm6ac6485515ae4",
  });
  assert.ok(!("error" in r), `ids must parse: ${"error" in r ? r.details : ""}`);
  assert.equal(r.asin, "B09XS7JWHH");
  assert.equal(r.fsn, "MOBGTAGPTB3VS24W");
  assert.equal(r.flipkartItemId, "itm6ac6485515ae4");
}

console.log("product-body tests ok");
