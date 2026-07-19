import assert from "node:assert/strict";
import {
  coerceStructuredPrice,
  normalizeOffer,
  parseGroupedNumber,
  parsePrice,
  sanitizeCachedOffers,
  toReferencePrice,
} from "./normalize.js";

function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
}

// --- contamination ---
ok(parsePrice("4.4 out of 5").amount == null, "rejects rating out of 5");
ok(parsePrice("4.4 stars").amount == null, "rejects star rating");
ok(parsePrice("12,483 ratings").amount == null, "rejects review/rating count");
ok(parsePrice("12,483 reviews").amount == null, "rejects reviews count");
ok(parsePrice("EMI ₹1,299/mo").amount == null, "rejects EMI text");
ok(parsePrice("Get 10% off").amount == null, "rejects percent-off coupon text");

ok(parsePrice("4.4", "INR", { allowBareNumeric: true }).amount == null, "bare 4.4 looks like rating");
ok(coerceStructuredPrice(4.4, "INR").amount == null, "structured 4.4 rating rejected");
ok(coerceStructuredPrice("12483", "INR").amount === 12483, "structured bare with INR ok");
ok(coerceStructuredPrice("4.4", null).amount == null, "structured rating string rejected");

// --- valid Indian / USD ---
ok(parsePrice("₹29,999").amount === 29999 && parsePrice("₹29,999").currency === "INR", "rupee western grouping");
ok(parsePrice("Rs. 1,24,999").amount === 124999, "rupee Indian lakh grouping");
ok(parsePrice("₹299.50").amount === 299.5, "rupee decimals");
ok(parsePrice("$199.99").amount === 199.99 && parsePrice("$199.99").currency === "USD", "usd price");

// --- currency conflict: marker wins ---
const conflict = normalizeOffer({
  retailer: "Amazon",
  retailerId: "amazon_in",
  url: "https://amazon.in/x",
  title: "Thing",
  priceRaw: "$199",
  currency: "INR",
  defaultCurrency: "INR",
  matchScore: 0.9,
  matchReason: "title",
});
ok(conflict.price === 199 && conflict.currency === "USD", "marker currency wins over declared INR");

const good = normalizeOffer({
  retailer: "Flipkart",
  retailerId: "flipkart",
  url: "https://flipkart.com/x",
  title: "Thing",
  priceRaw: "₹12,483",
  currency: "INR",
  defaultCurrency: "INR",
  matchScore: 0.9,
  matchReason: "title",
});
ok(good.price === 12483 && good.currency === "INR", "valid Flipkart price");

const contaminated = normalizeOffer({
  retailer: "Amazon",
  retailerId: "amazon_in",
  url: "https://amazon.in/x",
  title: "Thing",
  priceRaw: "4.4 out of 5",
  currency: "INR",
  defaultCurrency: "INR",
  matchScore: 0.9,
  matchReason: "title",
});
ok(contaminated.price == null, "contaminated structured price becomes null offer price");

// --- ambiguous bare without currency ---
ok(parsePrice("29999").amount == null, "bare number without allowBareNumeric rejected");
ok(parsePrice("29999", "INR", { allowBareNumeric: true, declaredCurrency: "INR" }).amount === 29999, "bare with declared INR ok");

// --- reference ---
const ref = toReferencePrice("₹295", null, "amazon_in", "INR");
ok(ref !== null && ref.amount === 295 && ref.currency === "INR", "toReferencePrice rupee");
ok(toReferencePrice("12,483 ratings", null, "amazon_in", "INR") === null, "toReferencePrice rejects ratings");
ok(toReferencePrice("299.99", "USD", "amazon_com", "USD")?.amount === 299.99, "toReferencePrice bare + USD");

ok(parseGroupedNumber("1,24,999") === 124999, "lakh grouping");
ok(parseGroupedNumber("12,483.50") === 12483.5, "western grouping");

// --- cache sanitizer ---
const cleaned = sanitizeCachedOffers([
  {
    retailer: "Amazon",
    retailerId: "amazon_in",
    url: "https://amazon.in/x",
    title: "X",
    price: 4.4,
    currency: "INR",
    priceRaw: "4.4 out of 5",
    shipping: null,
    deliveryEstimate: null,
    inStock: true,
    seller: null,
    coupons: [],
    matchScore: 0.8,
    matchReason: "title",
  },
  {
    retailer: "Flipkart",
    retailerId: "flipkart",
    url: "https://flipkart.com/x",
    title: "Y",
    price: 999,
    currency: "INR",
    priceRaw: "₹999",
    shipping: null,
    deliveryEstimate: null,
    inStock: true,
    seller: null,
    coupons: [],
    matchScore: 0.9,
    matchReason: "title",
  },
  { garbage: true },
]);
ok(cleaned.length === 2 && cleaned[0].price == null && cleaned[1].price === 999, "sanitizeCachedOffers strips contamination");

console.log("normalize.test.ts: all passed");
