import { calculateDeals } from "./calculator.js";
import type { MarketplaceOffer } from "../marketplaces/normalize.js";

function offer(partial: Partial<MarketplaceOffer> & Pick<MarketplaceOffer, "retailerId" | "price">): MarketplaceOffer {
  return {
    retailer: partial.retailer ?? "Test",
    retailerId: partial.retailerId,
    url: partial.url ?? "https://example.com",
    title: partial.title ?? "Product",
    price: partial.price,
    currency: "INR",
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

const amazon = offer({ retailer: "Amazon", retailerId: "amazon_in", price: 10000 });
const flipkart = offer({ retailer: "Flipkart", retailerId: "flipkart", price: 9800 });

const ranked = calculateDeals([amazon, flipkart], ["hdfc_cc", "amazon_prime"]);

assert(ranked.length === 2, "expected 2 deals");
assert(ranked[0].finalPayable < ranked[0].listPrice, "HDFC should discount Amazon");
// Amazon 10% of 10000 = 1000 + prime 40 = 1040 savings -> 8960
assert(ranked.find((d) => d.offer.retailerId === "amazon_in")!.totalSavings >= 1000, "amazon hdfc savings");
assert(ranked.every((d) => d.finalPayable >= 0), "no negative payable");

const noMethods = calculateDeals([amazon], []);
assert(noMethods[0].finalPayable === 10000, "no methods = list price");

// --- Regression: reported bug reproduction -----------------------------
// User had a real product page open at 295 on platform X. Compare re-searched
// and (due to a stale cache / wrong variant) returned a HIGHER price for the
// SAME platform, which must never be flagged as a "perfect deal".
const reference = { amount: 295, currency: "INR" };

const staleSamePlatformHigher = offer({ retailerId: "amazon_in", price: 349 });
const rankedAgainstReference = calculateDeals([staleSamePlatformHigher], [], { reference });
assert(
  rankedAgainstReference.length === 0,
  "a higher price than the reference must never be returned as a deal"
);

// A genuinely cheaper offer on a DIFFERENT platform is still allowed through.
const genuinelyCheaper = offer({ retailerId: "flipkart", price: 250 });
const rankedCheaper = calculateDeals([genuinelyCheaper], [], { reference });
assert(rankedCheaper.length === 1, "a verifiably cheaper offer on another platform is still shown as a deal");
assert(rankedCheaper[0].verifiedDeal === true, "verifiedDeal is true for the genuinely cheaper offer");

// An offer priced exactly equal to the reference is not "a deal" (must be strictly lower).
const equalPrice = offer({ retailerId: "flipkart", price: 295 });
assert(calculateDeals([equalPrice], [], { reference }).length === 0, "an equal price is never a deal");

// Currency mismatch is never verifiable as a deal even if the raw number is lower.
const wrongCurrency: MarketplaceOffer = { ...genuinelyCheaper, currency: "USD", price: 250 };
assert(
  calculateDeals([wrongCurrency], [], { reference }).length === 0,
  "a currency mismatch is never treated as a verified deal"
);

// --- Regression: self-comparison / dedup guard -------------------------
// When the identified product's own source platform is ALSO a compare target
// (matched upstream by applyReferenceGuard via retailerId + isCurrentListing),
// it must never be flagged as a "better deal" than itself - regardless of any
// card/coupon discount that would otherwise apply to that marketplace.
const currentListing: MarketplaceOffer = {
  ...offer({ retailerId: "amazon_in", price: 295 }),
  isCurrentListing: true,
};
const selfCompareRanked = calculateDeals([currentListing], ["hdfc_cc", "amazon_prime"], { reference });
assert(
  selfCompareRanked.length === 0,
  "the user's own current listing must never be flagged as a deal, even with a card discount applied"
);

// Without any reference price supplied (e.g. Direct Search has no "current
// page"), legacy behavior is unchanged - offers are ranked as before.
const legacyRanked = calculateDeals([amazon, flipkart], ["hdfc_cc", "amazon_prime"]);
assert(legacyRanked.every((d) => d.verifiedDeal === true), "no reference supplied = legacy unconstrained ranking");

console.log("deals/calculator ok");
