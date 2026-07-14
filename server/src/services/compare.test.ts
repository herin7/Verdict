import { applyReferenceGuard } from "./compare.js";
import type { MarketplaceOffer } from "../marketplaces/normalize.js";

function offer(partial: Partial<MarketplaceOffer> & Pick<MarketplaceOffer, "retailerId" | "price">): MarketplaceOffer {
  return {
    retailer: partial.retailer ?? "Test",
    retailerId: partial.retailerId,
    url: partial.url ?? "https://example.com",
    title: partial.title ?? "Product",
    price: partial.price,
    currency: partial.currency ?? "INR",
    priceRaw: String(partial.price),
    shipping: null,
    deliveryEstimate: null,
    inStock: true,
    seller: null,
    coupons: [],
    matchScore: 0.9,
    matchReason: "test",
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// --- Regression: same-platform re-scrape must never override the live
// on-screen (reference) price -------------------------------------------
// Reproduces the reported bug: user is looking at amazon_in at 295, but a
// fresh/cached re-scrape of amazon_in (the SAME platform) comes back with a
// stale/wrong-variant 349. The reference price must win.
const staleRescrape = offer({ retailerId: "amazon_in", price: 349 });
const otherPlatform = offer({ retailerId: "flipkart", price: 250 });
const reference = { amount: 295, currency: "INR", retailerId: "amazon_in" };

const guarded = applyReferenceGuard([staleRescrape, otherPlatform], reference);

const amazonOffer = guarded.find((o) => o.retailerId === "amazon_in")!;
assert(amazonOffer.price === 295, "same-platform offer price is forced to the live reference price, not the stale re-scrape");
assert(amazonOffer.isCurrentListing === true, "same-platform offer is flagged as the user's current listing");

const flipkartOffer = guarded.find((o) => o.retailerId === "flipkart")!;
assert(flipkartOffer.price === 250, "a different platform's offer is left untouched");
assert(!flipkartOffer.isCurrentListing, "a different platform is never flagged as the current listing");

// --- No reference supplied: no-op (legacy behavior unchanged) -----------
const untouched = applyReferenceGuard([staleRescrape, otherPlatform], null);
assert(untouched[0].price === 349, "without a reference price, offers pass through unchanged");
assert(!untouched[0].isCurrentListing, "without a reference price, nothing is flagged as the current listing");

// --- Reference without a known retailerId: can't self-match, so no-op ---
const noRetailer = applyReferenceGuard([staleRescrape], { amount: 295, currency: "INR" });
assert(noRetailer[0].price === 349, "a reference price with no known retailerId can't self-match, so it's a no-op");

// --- Currency carried from the reference, not the (possibly wrong) scrape
const wrongCurrencyScrape = offer({ retailerId: "amazon_in", price: 349, currency: "USD" });
const usdReference = { amount: 295, currency: "INR", retailerId: "amazon_in" };
const fixedCurrency = applyReferenceGuard([wrongCurrencyScrape], usdReference);
assert(fixedCurrency[0].currency === "INR", "the reference's currency wins over a mismatched scrape currency");

// --- Immutability: the guard never mutates the input array's objects, since
// concurrent requests can share the same in-flight/cached offers array with
// different reference prices.
const original = offer({ retailerId: "amazon_in", price: 349 });
const before = { ...original };
applyReferenceGuard([original], reference);
assert(original.price === before.price, "applyReferenceGuard never mutates the original offer objects");

console.log("services/compare ok");
