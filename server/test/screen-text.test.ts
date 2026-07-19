import assert from "node:assert/strict";
import {
  cleanScreenText,
  extractScreenPriceHint,
  isolatePrimaryProductRegion,
  rejoinSplitCurrency,
} from "../src/identify/screenText.js";
import { buildPriceCandidate, payableFromEvidence, toReferencePrice } from "../src/marketplaces/normalize.js";

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

/** Review count appears before sale price with currency marker on the count. */
const AMAZON_CURRENCY_MARKED_RATING = [
  "Sony WH-1000XM5 Wireless Headphones",
  "₹4.4 ratings",
  "₹12,483 ratings",
  "₹29,990",
  "M.R.P.: ₹34,990",
  "EMI from ₹1,299/mo",
  "Save extra with coupon on orders over ₹500",
  "Add to Cart",
  "Buy Now",
  "ASIN B09XS7JWHH",
].join("\n");

const AMAZON_INTEGER_RATING = [
  "Noise Cancelling Headphones",
  "4 out of 5",
  "5 stars",
  "₹8,999",
  "Add to Cart",
].join("\n");

/** Native often emits ₹ and digits as sibling a11y nodes. */
const AMAZON_SPLIT_CURRENCY = [
  "Sony WH-1000XM5 Wireless Headphones",
  "4.4 out of 5 stars",
  "₹",
  "29,990",
  "M.R.P.:",
  "₹",
  "34,990",
  "Add to Cart",
  "Buy Now",
  "ASIN B09XS7JWHH",
].join("\n");

const FLIPKART_PDP_DUMP = [
  "Search Flipkart",
  "Apple iPhone 15 (Blue, 128 GB)",
  "4.6",
  "1,24,583 Ratings",
  "₹64,900",
  "₹79,900",
  "17% off",
  "Available offers",
  "Add to cart",
  "Buy now",
  "FSN MOBGTAGPTB3VS24W",
].join("\n");

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
  assert.ok(/29,?990/.test(priceHint!), `sale price expected, got ${priceHint}`);
  assert.ok(!/34,?990/.test(priceHint!), "MRP must not win as priceHint");
  assert.ok(!/12,?483/.test(priceHint!), "review count must not win as priceHint");
  assert.equal(hasBuyBox, true, "Add to Cart / Buy Now button presence should be detected");
  assert.equal(hasBreadcrumb, true, "category breadcrumb trail should be detected");
  assert.ok(cleaned.includes("Sony WH-1000XM5"), "cleaned text should retain the product title");
  assert.ok(!cleaned.toLowerCase().includes("frequently bought together"), "recommendation chrome should be dropped");
  assert.ok(!cleaned.toLowerCase().includes("search amazon"), "nav chrome should be dropped");
}

function testCurrencyMarkedReviewAndEmiNeverWin() {
  const { priceHint, candidates } = extractScreenPriceHint(AMAZON_CURRENCY_MARKED_RATING, "IN");
  assert.ok(priceHint && /29,?990/.test(priceHint), `expected sale ₹29,990 got ${priceHint}`);
  assert.ok(
    candidates.some((c) => c.kind === "review_count" && c.amount == null),
    "currency-marked review count must classify as review_count with null amount"
  );
  assert.ok(candidates.some((c) => c.kind === "emi"), "EMI line must classify as emi");
  assert.ok(candidates.some((c) => c.kind === "original"), "MRP must classify as original");
  const payable = candidates.filter((c) => payableFromEvidence(c));
  assert.ok(payable.every((c) => c.amount === 29990 || /29,?990/.test(c.raw)), "only sale payable");
}

function testIntegerRatingNeverPrice() {
  const { priceHint } = extractScreenPriceHint(AMAZON_INTEGER_RATING, "IN");
  assert.ok(priceHint && /8,?999/.test(priceHint), `expected ₹8,999 got ${priceHint}`);
  const ratingCand = buildPriceCandidate({
    raw: "4",
    context: "4 out of 5",
    source: "screen_text",
    declaredCurrency: "INR",
  });
  assert.equal(payableFromEvidence(ratingCand), null);
}

function testSnippetContamination() {
  const snip = buildPriceCandidate({
    raw: "₹12,483",
    context: "Sony WH-1000XM5 ₹12,483 ratings Free delivery",
    source: "search_snippet",
    declaredCurrency: "INR",
  });
  assert.equal(snip.kind, "review_count");
  assert.equal(payableFromEvidence(snip), null);

  const mrpFirst = buildPriceCandidate({
    raw: "₹34,990",
    context: "M.R.P.: ₹34,990 Sale ₹29,990",
    source: "search_snippet",
    declaredCurrency: "INR",
  });
  assert.equal(mrpFirst.kind, "original");
  assert.equal(payableFromEvidence(mrpFirst), null);

  const saleBesideMrp = buildPriceCandidate({
    raw: "₹29,990",
    context: "M.R.P.: ₹34,990 Sale ₹29,990",
    source: "search_snippet",
    declaredCurrency: "INR",
  });
  assert.equal(saleBesideMrp.kind, "sale");
  assert.deepEqual(payableFromEvidence(saleBesideMrp), { amount: 29990, currency: "INR" });

  const foreign = toReferencePrice("$199", "INR", "amazon_in", "INR", "Apple AirPods $199");
  assert.ok(foreign == null || foreign.currency === "USD");
}

function testAmazonDealPriceBeatsMrp() {
  const dump = [
    "boAt Airdopes 141",
    "Deal Price",
    "₹1,499",
    "M.R.P.:",
    "₹2,999",
    "Inclusive of all taxes",
    "Add to Cart",
    "Buy Now",
  ].join("\n");
  const { priceHint } = extractScreenPriceHint(dump, "IN");
  assert.ok(priceHint && /1,?499/.test(priceHint), `Deal Price must win, got ${priceHint}`);
  assert.ok(!/2,?999/.test(priceHint!), "MRP must not win");
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

function testSplitCurrencyRejoin() {
  assert.equal(rejoinSplitCurrency("₹\n29,990"), "₹29,990");
  const { priceHint } = extractScreenPriceHint(AMAZON_SPLIT_CURRENCY, "IN");
  assert.ok(priceHint && /29,?990/.test(priceHint), `split ₹ + digits should yield sale, got ${priceHint}`);
  assert.ok(!/34,?990/.test(priceHint!), "MRP after split must not win");
}

function testFlipkartPdpPriceHint() {
  const { priceHint, hasBuyBox, fsn } = cleanScreenText(FLIPKART_PDP_DUMP, "IN");
  assert.equal(hasBuyBox, true);
  assert.ok(priceHint && /64,?900/.test(priceHint), `Flipkart sale expected, got ${priceHint}`);
  assert.equal(fsn, "MOBGTAGPTB3VS24W", "FSN should be extracted from Flipkart PDP dump");
}

function testAsinFromUrlInDump() {
  const dump = [
    "Sony WH-1000XM5",
    "https://www.amazon.in/dp/B09XS7JWHH/ref=sr_1",
    "₹29,990",
    "Add to Cart",
  ].join("\n");
  const { asin } = cleanScreenText(dump, "IN");
  assert.equal(asin, "B09XS7JWHH", "ASIN from amazon.in/dp URL in a11y dump");
}

function testQuickCommerceRecommendationsCannotReplaceMainProduct() {
  const dump = [
    "Amul Taaza Toned Fresh Milk",
    "1 L",
    "₹74",
    "Add",
    "Product details",
    "Recommended for you",
    "Cadbury Dairy Milk Silk",
    "₹42",
    "Add",
    "Maggi 2-Minute Noodles 280 g",
    "₹58",
    "Add",
  ].join("\n");
  const primary = isolatePrimaryProductRegion(dump);
  assert.ok(primary.includes("Amul Taaza"), "main quick-commerce product stays");
  assert.ok(!primary.includes("Cadbury"), "recommended product is cut off");
  assert.ok(!primary.includes("Maggi"), "later recommendation is cut off");

  const { cleaned, priceHint } = cleanScreenText(dump, "IN");
  assert.ok(cleaned.includes("Amul Taaza"), "cleaned identity retains main product");
  assert.ok(!cleaned.includes("Cadbury"), "cleaned identity excludes recommendations");
  assert.equal(priceHint, "₹74", "main product price wins over recommendation prices");
}

function main() {
  testAmazonPdpFixtureYieldsStrongSignals();
  testCurrencyMarkedReviewAndEmiNeverWin();
  testIntegerRatingNeverPrice();
  testSnippetContamination();
  testAmazonDealPriceBeatsMrp();
  testHomeFeedFixtureHasNoStrongSignals();
  testUsPriceRegexStillWorks();
  testSplitCurrencyRejoin();
  testFlipkartPdpPriceHint();
  testAsinFromUrlInDump();
  testQuickCommerceRecommendationsCannotReplaceMainProduct();
  console.log("screen-text tests passed");
}

main();
