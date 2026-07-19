import assert from "node:assert/strict";
import { extractPack, packMatch } from "./pack.js";

assert.deepEqual(extractPack("Amul Taaza Milk 1 L"), { amount: 1000, unit: "ml", count: 1 });
assert.deepEqual(extractPack("Surf Excel 1 kg"), { amount: 1000, unit: "g", count: 1 });
assert.deepEqual(extractPack("Colgate 200 gm"), { amount: 200, unit: "g", count: 1 });
assert.deepEqual(extractPack("Maggi 280 g x 4"), { amount: 280, unit: "g", count: 4 });
assert.deepEqual(extractPack("Soap 4 x 200 g"), { amount: 200, unit: "g", count: 4 });
assert.deepEqual(extractPack("Coca-Cola Pack of 24 750 ml"), { amount: 750, unit: "ml", count: 24 });
assert.equal(extractPack("12 inch ring light"), null);

assert.equal(packMatch("Milk 1 L", "Milk 1000 ml"), "exact");
assert.equal(packMatch("Maggi 560 g", "Maggi 280 g x 2"), "mismatch");
assert.equal(packMatch("Coke 750 ml", "Coke 250 ml"), "mismatch");
assert.equal(packMatch("Surf Excel 1 kg", "Surf Excel detergent"), "unknown");
assert.equal(packMatch("iPhone 15", "Apple iPhone 15 128 GB"), "unknown");

console.log("marketplaces/pack ok");
