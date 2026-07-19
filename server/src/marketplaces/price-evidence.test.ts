import assert from "node:assert/strict";
import {
  buildPriceCandidate,
  normalizeOffer,
  payableFromEvidence,
  pickBestPayableCandidate,
  pickBestPayableFromText,
} from "./normalize.js";
import { extractScreenPriceHint } from "../identify/screenText.js";

function testSameLineMrpAndDeal() {
  const ctx = "M.R.P.: ₹2,999 Deal Price ₹1,499 Inclusive of all taxes";
  const sale = buildPriceCandidate({
    raw: "₹1,499",
    context: ctx,
    source: "search_snippet",
    declaredCurrency: "INR",
  });
  const mrp = buildPriceCandidate({
    raw: "₹2,999",
    context: ctx,
    source: "search_snippet",
    declaredCurrency: "INR",
  });
  assert.equal(sale.kind, "sale");
  assert.deepEqual(payableFromEvidence(sale), { amount: 1499, currency: "INR" });
  assert.equal(mrp.kind, "original");
  assert.equal(payableFromEvidence(mrp), null);

  const best = pickBestPayableFromText(ctx, {
    source: "search_snippet",
    defaultCurrency: "INR",
  });
  assert.ok(best && best.amount === 1499, `expected deal 1499 got ${best?.amount}`);
}

function testSnippetMrpFirstStillPicksSale() {
  const snip =
    "Sony WH-1000XM5 Wireless Headphones M.R.P. ₹34,990 ₹29,990 Free delivery";
  const best = pickBestPayableFromText(snip, {
    source: "search_snippet",
    defaultCurrency: "INR",
  });
  assert.ok(best && /29,?990/.test(best.raw), `snippet must prefer sale, got ${best?.raw}`);
  assert.ok(best.amount === 29990);
}

function testAmazonA11yMrpAndLimitedDeal() {
  const dump = [
    "Sony WH-1000XM5 Wireless Headphones",
    "Limited time deal",
    "₹14,990",
    "M.R.P. ₹29,990",
    "Inclusive of all taxes",
    "Add to Cart",
    "Buy Now",
    "ASIN B09XS7JWHH",
  ].join("\n");
  const { priceHint, candidates } = extractScreenPriceHint(dump, "IN");
  assert.ok(priceHint && /14,?990/.test(priceHint), `expected deal price, got ${priceHint}`);
  assert.ok(!/29,?990/.test(priceHint!), "MRP must not win");
  assert.ok(candidates.some((c) => c.kind === "original" && c.amount === 29990));
}

function testFlipkartSellingAndMrp() {
  const dump = [
    "Apple iPhone 15 (Blue, 128 GB)",
    "₹64,900",
    "₹79,900",
    "17% off",
    "Add to cart",
    "Buy now",
  ].join("\n");
  const { priceHint } = extractScreenPriceHint(dump, "IN");
  assert.ok(priceHint && /64,?900/.test(priceHint), `Flipkart selling price expected, got ${priceHint}`);
}

function testFlipkartSameLineDual() {
  const dump = [
    "Noise Buds",
    "₹1,499 ₹2,999",
    "Add to cart",
  ].join("\n");
  const { priceHint } = extractScreenPriceHint(dump, "IN");
  assert.ok(priceHint && /1,?499/.test(priceHint), `same-line Flipkart must pick lower, got ${priceHint}`);
}

function testNormalizeOfferRescansContext() {
  const offer = normalizeOffer({
    retailer: "Amazon.in",
    retailerId: "amazon_in",
    url: "https://www.amazon.in/dp/B09XS7JWHH",
    title: "Sony WH-1000XM5",
    priceRaw: "₹34,990",
    priceContext: "M.R.P.: ₹34,990 Sale ₹29,990",
    priceSource: "search_snippet",
    currency: "INR",
    defaultCurrency: "INR",
    matchScore: 0.9,
    matchReason: "title",
  });
  assert.equal(offer.price, 29990, "normalizeOffer must resurface sale when raw was MRP");
  assert.ok(offer.priceRaw && /29,?990/.test(offer.priceRaw));
}

function testPickBestPrefersSaleOverCurrent() {
  const sale = buildPriceCandidate({
    raw: "₹999",
    context: "Deal Price ₹999",
    source: "screen_text",
    declaredCurrency: "INR",
  });
  const current = buildPriceCandidate({
    raw: "₹1,499",
    context: "₹1,499",
    source: "screen_text",
    declaredCurrency: "INR",
  });
  const best = pickBestPayableCandidate([current, sale]);
  assert.equal(best?.amount, 999);
}

function main() {
  testSameLineMrpAndDeal();
  testSnippetMrpFirstStillPicksSale();
  testAmazonA11yMrpAndLimitedDeal();
  testFlipkartSellingAndMrp();
  testFlipkartSameLineDual();
  testNormalizeOfferRescansContext();
  testPickBestPrefersSaleOverCurrent();
  console.log("price-evidence tests passed");
}

main();
