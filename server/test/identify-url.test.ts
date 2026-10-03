import assert from "node:assert/strict";
import { isJunkProductName, nameFromUrlSlug } from "../src/identify/fromUrl.js";

assert.ok(isJunkProductName("aax-eu.amazon-adsystem.com"));
assert.ok(isJunkProductName("veirdo.in"));
assert.ok(isJunkProductName("Amazon.in"));
assert.ok(isJunkProductName("Robot Check"));
assert.ok(!isJunkProductName("Sony WH-1000XM5 Headphones"));
assert.ok(!isJunkProductName("boAt Rockerz 450"));

assert.equal(
  nameFromUrlSlug("https://www.amazon.in/Boat-Rockerz-450-Bluetooth-Headphones/dp/B07PR1CL3S?ref=x"),
  "Boat Rockerz 450 Bluetooth Headphones"
);
assert.equal(nameFromUrlSlug("https://www.flipkart.com/ampere-reo-vyb/p/itm123"), "ampere reo vyb");
assert.equal(nameFromUrlSlug("https://www.amazon.in/dp/B07PR1CL3S"), null);
console.log("identify url tests passed");

import { cleanStoreTitle } from "../src/identify/fromUrl.js";
assert.equal(
  cleanStoreTitle("Amazon.in: Buy Logitech PRO X2 Wireless Gaming Mouse : Amazon.in: Computers & Accessories"),
  "Logitech PRO X2 Wireless Gaming Mouse"
);
assert.equal(nameFromUrlSlug("https://veirdo.in/products/negroni-lime-green-oversized-t-shirt?variant=1"), "negroni lime green oversized t shirt");
console.log("store title tests passed");
