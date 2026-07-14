import assert from "node:assert/strict";
import { cleanScreenText } from "../src/identify/screenText.js";

/**
 * Realistic Amazon.in PDP accessibility-tree dump: nav chrome, buy box,
 * breadcrumb, price, and ASIN all present, roughly as Android's
 * accessibility service would flatten it into a single string.
 */
const AMAZON_PDP_DUMP = [
  "Search Amazon.in",
  "Hello, sign in",
  "Deliver to Bengaluru 560001",
  "Electronics › Headphones, Earbuds & Accessories › Headphones",
  "Sony WH-1000XM5 Wireless Industry Leading Noise Canceling Headphones with Auto Noise Canceling Optimizer",
  "Visit the Sony Store",
  "4.4 out of 5 stars",
  "12,483 ratings",
  "₹29,990",
  "M.R.P.: ₹34,990",
  "Inclusive of all taxes",
  "Get it by Tomorrow, 9 AM - 1 PM",
  "In stock",
  "Qty",
  "1",
  "Add to Cart",
  "Buy Now",
  "Secure transaction",
  "Ships from Amazon",
  "Sold by Appario Retail Private Ltd",
  "ASIN B09XS7JWHH",
  "Customers who bought this item also bought",
  "Frequently bought together",
].join("\n");

/** A home-feed / search-results dump: many products, no single PDP signal. */
const HOME_FEED_DUMP = [
  "Search Amazon.in",
  "Today's deals",
  "Best sellers",
  "Sponsored",
  "Under ₹499 store",
  "Top picks for you",
  "Related products",
  "See all",
].join("\n");

function testAmazonPdpFixtureYieldsStrongSignals() {
  const { cleaned, asin, priceHint, hasBuyBox, hasBreadcrumb } = cleanScreenText(AMAZON_PDP_DUMP, "IN");

  assert.equal(asin, "B09XS7JWHH", "ASIN should be extracted and uppercased");
  assert.ok(priceHint, "a rupee price should be detected");
  assert.equal(hasBuyBox, true, "Add to Cart / Buy Now button presence should be detected");
  assert.equal(hasBreadcrumb, true, "category breadcrumb trail should be detected");
  assert.ok(cleaned.includes("Sony WH-1000XM5"), "cleaned text should retain the product title");
  assert.ok(!cleaned.toLowerCase().includes("frequently bought together"), "recommendation chrome should be dropped");
  assert.ok(!cleaned.toLowerCase().includes("search amazon"), "nav chrome should be dropped");
}

function testHomeFeedFixtureHasNoStrongSignals() {
  const { asin, hasBuyBox, hasBreadcrumb } = cleanScreenText(HOME_FEED_DUMP, "IN");
  assert.equal(asin, null, "no ASIN should be detected on a feed page");
  assert.equal(hasBuyBox, false, "no buy box should be detected on a feed page");
  assert.equal(hasBreadcrumb, false, "no breadcrumb should be detected on a feed page");
}

function testUsPriceRegexStillWorks() {
  const dump = "Apple AirPods Pro (2nd Generation)\n$199.99\nAdd to Cart\nBuy Now\nASIN B0BDHWDR12";
  const { priceHint, asin, hasBuyBox } = cleanScreenText(dump, "US");
  assert.equal(priceHint, "$199.99", "US price regex should match dollar amounts");
  assert.equal(asin, "B0BDHWDR12");
  assert.equal(hasBuyBox, true);
}

function main() {
  testAmazonPdpFixtureYieldsStrongSignals();
  testHomeFeedFixtureHasNoStrongSignals();
  testUsPriceRegexStillWorks();
  console.log("screen-text tests passed");
}

main();
