import assert from "node:assert/strict";
import { currencyFor, findMarketplace, isAllowedMarketplaceUrl, normalizeCountry } from "./registry.js";
import { toReferencePrice } from "./normalize.js";

assert.equal(findMarketplace("https://www.amazon.in/dp/B0CHX1W1XY")?.id, "amazon_in");
assert.equal(findMarketplace("https://dl.flipkart.com/s/abc")?.id, "flipkart", "subdomains resolve to their store");
assert.equal(findMarketplace("https://www.bestbuy.com/site/x", "US")?.name, "Best Buy");
assert.equal(findMarketplace("https://www.bestbuy.com/site/x", "IN"), null, "lookup is country-scoped when a country is given");
assert.equal(findMarketplace("https://evil-amazon.in.example.com/x"), null, "lookalike hosts are not stores");
assert.equal(isAllowedMarketplaceUrl("not a url"), false);

assert.equal(normalizeCountry("US"), "US");
assert.equal(normalizeCountry("anything else"), "IN");
assert.equal(currencyFor("US"), "USD");

// The price printed on a shared listing: parsed when present, never invented.
const ref = toReferencePrice("₹295", null, "amazon_in", "INR");
assert(ref !== null && ref.amount === 295 && ref.currency === "INR", "toReferencePrice parses a rupee price");
assert.equal(toReferencePrice("Currently unavailable", null, "amazon_in", "INR"), null);

console.log("marketplaces/registry ok");
