import { applyReferenceGuard, currentQuickCommerceOffer } from "./compare.js";
import {
  filterPricedOffers,
  inferStockStatus,
  sortOffersForDeals,
  type MarketplaceOffer,
} from "../marketplaces/normalize.js";

function offer(
  partial: Partial<MarketplaceOffer> & Pick<MarketplaceOffer, "retailerId" | "price">
): MarketplaceOffer {
  return {
    retailer: partial.retailer ?? "Test",
    retailerId: partial.retailerId,
    url: partial.url ?? "https://example.com",
    title: partial.title ?? "Product",
    price: partial.price,
    currency: partial.currency ?? "INR",
    priceRaw: partial.price != null ? String(partial.price) : null,
    shipping: null,
    deliveryEstimate: null,
    inStock: partial.inStock ?? true,
    seller: null,
    coupons: [],
    matchScore: 0.9,
    matchReason: partial.matchReason ?? "test",
    checkManually: partial.checkManually,
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// --- Regression: same-platform re-scrape must never override the live
// on-screen (reference) price -------------------------------------------
const staleRescrape = offer({ retailerId: "amazon_in", price: 349 });
const otherPlatform = offer({ retailerId: "flipkart", price: 250 });
const reference = { amount: 295, currency: "INR", retailerId: "amazon_in" };

const guarded = applyReferenceGuard([staleRescrape, otherPlatform], reference);

const amazonOffer = guarded.find((o) => o.retailerId === "amazon_in")!;
assert(
  amazonOffer.price === 295,
  "same-platform offer price is forced to the live reference price, not the stale re-scrape"
);
assert(amazonOffer.isCurrentListing === true, "same-platform offer is flagged as the user's current listing");

const flipkartOffer = guarded.find((o) => o.retailerId === "flipkart")!;
assert(flipkartOffer.price === 250, "a different platform's offer is left untouched");
assert(!flipkartOffer.isCurrentListing, "a different platform is never flagged as the current listing");

const untouched = applyReferenceGuard([staleRescrape, otherPlatform], null);
assert(untouched[0]!.price === 349, "without a reference price, offers pass through unchanged");
assert(!untouched[0]!.isCurrentListing, "without a reference price, nothing is flagged as the current listing");

const noRetailer = applyReferenceGuard([staleRescrape], { amount: 295, currency: "INR" });
assert(
  noRetailer[0]!.price === 349,
  "a reference price with no known retailerId can't self-match, so it's a no-op"
);

const wrongCurrencyScrape = offer({ retailerId: "amazon_in", price: 349, currency: "USD" });
const usdReference = { amount: 295, currency: "INR", retailerId: "amazon_in" };
const fixedCurrency = applyReferenceGuard([wrongCurrencyScrape], usdReference);
assert(fixedCurrency[0]!.currency === "INR", "the reference's currency wins over a mismatched scrape currency");

const original = offer({ retailerId: "amazon_in", price: 349 });
const before = { ...original };
applyReferenceGuard([original], reference);
assert(original.price === before.price, "applyReferenceGuard never mutates the original offer objects");

// --- Display gate: OOS-with-price kept; missing / check-manually omitted ---
const oosPriced = offer({ retailerId: "amazon_in", price: 999, inStock: false });
const available = offer({ retailerId: "flipkart", price: 1200, inStock: true });
const manual = offer({
  retailerId: "blinkit",
  price: null,
  checkManually: true,
  matchReason: "check_manually",
});
const unpriced = offer({ retailerId: "myntra", price: null });

const gated = filterPricedOffers([oosPriced, available, manual, unpriced]);
assert(gated.length === 2, "only priced non-manual offers survive");
assert(
  gated.some((o) => o.inStock === false && o.price === 999),
  "OOS with price is kept"
);
assert(!gated.some((o) => o.checkManually), "check-manually shells omitted");
assert(!gated.some((o) => o.price == null), "unpriced / missing platforms omitted");

const sorted = sortOffersForDeals([oosPriced, available]);
assert(sorted[0]!.retailerId === "flipkart", "in-stock priced offers sort before OOS");
assert(sorted[1]!.inStock === false, "OOS-with-price sorts after available");

assert(inferStockStatus("Sony headphones out of stock ₹29,990", null) === false, "snippet OOS sniff");
assert(inferStockStatus("In stock Add to Cart", null) === true, "snippet in-stock sniff");
assert(inferStockStatus("something", true) === true, "structured stock wins");
assert(inferStockStatus("out of stock", true) === true, "structured true beats text");

const quickProduct = {
  name: "Amul Taaza Milk 1 L",
  brand: "Amul",
  category: "grocery",
  model: null,
  confidence: 0.9,
  searchTerm: "Amul Taaza Milk 1 L",
};
const currentQuickOffer = currentQuickCommerceOffer(quickProduct, "IN", {
  amount: 74,
  currency: "INR",
  retailerId: "blinkit",
});
assert(currentQuickOffer?.price === 74, "live quick-commerce reference becomes a priced offer");
assert(currentQuickOffer?.retailerId === "blinkit", "current quick-commerce retailer is preserved");
assert(currentQuickOffer?.matchReason === "current_listing", "current listing provenance is explicit");
assert(
  currentQuickCommerceOffer(quickProduct, "IN", {
    amount: 74,
    currency: "INR",
    retailerId: "amazon_in",
  }) === null,
  "regular marketplaces still rely on exact PDP retrieval"
);

console.log("services/compare ok");
