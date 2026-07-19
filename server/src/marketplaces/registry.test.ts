import {
  deeplinkOnlyMarketplacesFor,
  isScrapeCapable,
  manualUrlFor,
  marketplaceIdForPackage,
  marketplacesFor,
  scrapeMarketplacesFor,
} from "./registry.js";
import { normalizeOffer, toReferencePrice } from "./normalize.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const inList = marketplacesFor("IN");
const scrapeCapable = scrapeMarketplacesFor("IN");
const deeplinkOnly = deeplinkOnlyMarketplacesFor("IN");

// Every IN marketplace is classified into exactly one bucket.
assert(scrapeCapable.length + deeplinkOnly.length === inList.length, "capability partition covers all marketplaces");

// Pre-existing marketplaces without an explicit capability default to scrape-capable
// (backwards compatible - Amazon/Flipkart behavior must not change).
const amazon = inList.find((m) => m.id === "amazon_in")!;
assert(isScrapeCapable(amazon), "amazon_in defaults to scrape-capable");

const flipkart = inList.find((m) => m.id === "flipkart")!;
assert(isScrapeCapable(flipkart), "flipkart defaults to scrape-capable");

// The 6 requested quick-commerce platforms are all present.
for (const id of ["milkbasket", "blinkit", "zepto", "flipkart_minutes", "bigbasket", "swiggy_instamart"]) {
  assert(inList.some((m) => m.id === id), `${id} is registered for IN`);
}

// Per-platform strategy: scrape-capable vs deeplink-only, per research.
assert(!isScrapeCapable(inList.find((m) => m.id === "blinkit")!), "blinkit is location-gated");
assert(inList.find((m) => m.id === "blinkit")!.antiBotStealth === true, "blinkit requests enhanced proxy");
assert(!isScrapeCapable(inList.find((m) => m.id === "bigbasket")!), "bigbasket is location-gated");
assert(!isScrapeCapable(inList.find((m) => m.id === "zepto")!), "zepto is deeplink-only (signed/session-gated API)");
assert(!isScrapeCapable(inList.find((m) => m.id === "milkbasket")!), "milkbasket is deeplink-only (no public catalog)");
assert(
  !isScrapeCapable(inList.find((m) => m.id === "flipkart_minutes")!),
  "flipkart_minutes is deeplink-only (embedded tab, no separate catalog)"
);
assert(
  !isScrapeCapable(inList.find((m) => m.id === "swiggy_instamart")!),
  "swiggy_instamart is deeplink-only (no public API/catalog)"
);

// manualUrlFor always returns a usable URL for deeplink-only platforms.
for (const m of deeplinkOnly) {
  const url = manualUrlFor(m);
  assert(url.startsWith("https://"), `manualUrlFor(${m.id}) returns an https URL`);
}

// manualUrlFor with a query builds a real search URL (not the bare homepage) for
// deeplinkOnly platforms that have a documented search page.
const zeptoSearch = manualUrlFor(inList.find((m) => m.id === "zepto")!, "amul milk");
assert(
  zeptoSearch === "https://www.zepto.com/search?query=amul%20milk",
  "zepto manualUrlFor builds its documented search URL"
);
const swiggySearch = manualUrlFor(inList.find((m) => m.id === "swiggy_instamart")!, "amul milk");
assert(
  swiggySearch === "https://www.swiggy.com/instamart/search?query=amul%20milk",
  "swiggy_instamart manualUrlFor builds its documented search URL"
);
const flipkartMinutesSearch = manualUrlFor(inList.find((m) => m.id === "flipkart_minutes")!, "amul milk");
assert(
  flipkartMinutesSearch === "https://www.flipkart.com/search?q=amul%20milk",
  "flipkart_minutes manualUrlFor falls back to Flipkart's own search"
);

// Milkbasket has no documented search page - falls back to a scoped web search,
// never the bare homepage, when a query is given.
const milkbasketSearch = manualUrlFor(inList.find((m) => m.id === "milkbasket")!, "amul milk");
assert(
  milkbasketSearch.startsWith("https://www.google.com/search?q="),
  "milkbasket manualUrlFor falls back to a scoped web search (no documented search page)"
);
assert(
  milkbasketSearch.includes("milkbasket.com"),
  "milkbasket web-search fallback is scoped to its own domain"
);

// Blinkit and BigBasket are flagged locationAware so the compare service can pass
// explicit IN geography to the scraper once the user grants location.
assert(inList.find((m) => m.id === "blinkit")!.locationAware === true, "blinkit is locationAware");
assert(inList.find((m) => m.id === "bigbasket")!.locationAware === true, "bigbasket is locationAware");

// normalizeOffer defaults checkManually to false unless explicitly set.
const liveOffer = normalizeOffer({
  retailer: "Amazon",
  retailerId: "amazon_in",
  url: "https://amazon.in/p",
  title: "Test",
  priceRaw: "₹100",
  matchScore: 1,
  matchReason: "test",
});
assert(liveOffer.checkManually === false, "live offers default checkManually to false");
assert(liveOffer.price === 100, "price parsed correctly");

const manualOffer = normalizeOffer({
  retailer: "Milkbasket",
  retailerId: "milkbasket",
  url: "https://www.milkbasket.com/",
  title: "Test",
  priceRaw: null,
  matchScore: 0,
  matchReason: "check_manually",
  checkManually: true,
});
assert(manualOffer.checkManually === true, "manual offers set checkManually true");
assert(manualOffer.price === null, "manual offers never fabricate a price");

// marketplaceIdForPackage lets the screen-text identify flow (packageName only,
// no URL) recognize which platform the user is currently viewing, for the
// same-platform deal guard.
assert(
  marketplaceIdForPackage("com.amazon.mShop.android.shopping", "IN") === "amazon_in",
  "recognizes Amazon's Android package"
);
assert(
  marketplaceIdForPackage("com.flipkart.android", "IN") === "flipkart",
  "recognizes Flipkart's Android package"
);
assert(
  marketplaceIdForPackage("com.some.unrelated.app", "IN") === null,
  "unrecognized packages resolve to null, never a guess"
);
assert(
  marketplaceIdForPackage("com.amazon.mobile.shopping", "US") === "amazon_com",
  "package matching is country-scoped (US amazon_com, not IN amazon_in)"
);

// toReferencePrice builds a ReferencePrice from a raw priceHint, never
// fabricating one when no number can be parsed.
const ref = toReferencePrice("₹295", null, "amazon_in", "INR");
assert(ref !== null && ref.amount === 295 && ref.currency === "INR" && ref.retailerId === "amazon_in", "toReferencePrice parses a rupee price");
assert(toReferencePrice(null, null, "amazon_in", "INR") === null, "toReferencePrice returns null when there is no raw price");
assert(toReferencePrice("no price here", null, "amazon_in", "INR") === null, "toReferencePrice never fabricates an amount");
const usdRef = toReferencePrice("299.99", "USD", "amazon_com", "USD");
assert(usdRef !== null && usdRef.amount === 299.99 && usdRef.currency === "USD", "toReferencePrice prefers the explicit currency over guessing from the raw string");

console.log("marketplaces/registry ok");
