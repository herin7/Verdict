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

console.log("deals/calculator ok");
