/**
 * Manual network smoke test. Never imported by tests or CI.
 * Run explicitly: LIVE_PRICE_SMOKE=1 npx tsx scripts/live-price-smoke.ts
 * Optional: SMOKE_MARKETPLACE=amazon_in|flipkart|blinkit|zepto|swiggy_instamart|bigbasket|flipkart_minutes
 */
import { performance } from "node:perf_hooks";
import { parseAmazonInHtml } from "../src/marketplaces/direct/amazonIn.js";
import { parseFlipkartHtml } from "../src/marketplaces/direct/flipkart.js";
import { fetchHtml } from "../src/marketplaces/direct/http.js";

if (process.env.LIVE_PRICE_SMOKE !== "1") {
  throw new Error("Set LIVE_PRICE_SMOKE=1 to allow manual network requests");
}

type SmokeCase = {
  marketplace: string;
  product: string;
  expectedPack?: string;
  url: string;
  asin?: string;
};

const cases: SmokeCase[] = [
  { marketplace: "amazon_in", product: "Sony WH-1000XM5 headphones", url: "https://www.amazon.in/dp/B09XS7JWHH", asin: "B09XS7JWHH" },
  { marketplace: "amazon_in", product: "Surf Excel Easy Wash 1 kg", expectedPack: "1 kg", url: "https://www.amazon.in/dp/B078GXS47N", asin: "B078GXS47N" },
  { marketplace: "amazon_in", product: "Bestor 12 inch ring light", url: "https://www.amazon.in/dp/B0H87NSQPR", asin: "B0H87NSQPR" },
  { marketplace: "amazon_in", product: "BVE3586 footwear", url: "https://www.amazon.in/dp/B0CG4TYW4D", asin: "B0CG4TYW4D" },
  { marketplace: "amazon_in", product: "ARMAR travel organizer set", url: "https://www.amazon.in/dp/B0H8VY6C1N", asin: "B0H8VY6C1N" },
  { marketplace: "flipkart", product: "Apple iPhone 15 128 GB", url: "https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4" },
  { marketplace: "flipkart", product: "Adidas Duramo SL2 women shoes", url: "https://www.flipkart.com/adidas-duramo-sl2-w-running-shoes-women/p/itme07b53cde9750" },
  { marketplace: "flipkart", product: "Trenical leather office shoes", url: "https://www.flipkart.com/trenical-men-s-highly-comfortable-leather-shoe-stylish-classy-office-wear-loafers-shoes-men/p/itmd656e2bc2964b" },
  { marketplace: "flipkart", product: "Spencer personal hygiene combo", url: "https://www.flipkart.com/spencer-s-personal-hygiene-combo-soap-toothpaste-detergent/p/itm556e5019902ac" },
  { marketplace: "flipkart", product: "Enflamo iPhone 16 back cover", url: "https://www.flipkart.com/enflamo-back-cover-apple-iphone-16/p/itme6ed37009549f" },
  { marketplace: "blinkit", product: "Amul Taaza toned milk", expectedPack: "1 L", url: "https://blinkit.com/prn/amul-taaza-toned-milk/prid/19512" },
  { marketplace: "blinkit", product: "Maggi masala noodles", expectedPack: "560 g", url: "https://blinkit.com/prn/maggi-masala-2-minutes-instant-noodles-made-with-quality-spices/prid/171258" },
  { marketplace: "blinkit", product: "Surf Excel Easy Wash", expectedPack: "1 kg", url: "https://blinkit.com/prn/surf-excel-easy-wash-detergent-powder/prid/580964" },
  { marketplace: "zepto", product: "Maggi masala noodles", expectedPack: "280 g", url: "https://www.zepto.com/pn/maggi-2-minute-instant-noodles-masala-noodles-made-with-quality-spices/pvid/cf7f86bc-73ef-45e5-a229-38ab35680914" },
  { marketplace: "swiggy_instamart", product: "Maggi masala noodles", expectedPack: "280 g x 4", url: "https://www.swiggy.com/instamart/p/maggi-masala-instant-noodles-L5XS0G5W34" },
  { marketplace: "swiggy_instamart", product: "Amul Taaza toned milk", expectedPack: "1 L x 6", url: "https://www.swiggy.com/instamart/p/amul-taaza-toned-milk-3JLSTZX5JY" },
  { marketplace: "bigbasket", product: "Amul Taaza", expectedPack: "1 L", url: "https://www.bigbasket.com/pd/40175765/amul-amul-taaza-1-l/" },
  { marketplace: "bigbasket", product: "Surf Excel Easy Wash", expectedPack: "1 kg", url: "https://www.bigbasket.com/pd/40101707/surf-excel-easy-wash-detergent-powder-1-kg/" },
  { marketplace: "bigbasket", product: "Coca-Cola", expectedPack: "750 ml x 24", url: "https://www.bigbasket.com/pd/412123/coca-cola-coca-cola-750-ml/" },
  { marketplace: "flipkart_minutes", product: "Coca-Cola 750 ml", expectedPack: "750 ml", url: "https://www.flipkart.com/flipkart-minutes-store?marketplace=HYPERLOCAL" },
];

const selected = process.env.SMOKE_MARKETPLACE
  ? cases.filter((c) => c.marketplace === process.env.SMOKE_MARKETPLACE)
  : cases;

for (const test of selected) {
  const started = performance.now();
  const response = await fetchHtml(test.url, { timeoutMs: 7_000 });
  const latencyMs = Math.round(performance.now() - started);
  if (!response.ok) {
    console.log(JSON.stringify({ ...test, latencyMs, result: "fetch_failed", failureReason: response.error }));
    continue;
  }

  const parsed =
    test.marketplace === "amazon_in"
      ? parseAmazonInHtml(response.html, { asin: test.asin!, url: response.finalUrl })
      : test.marketplace === "flipkart"
        ? parseFlipkartHtml(response.html, { url: response.finalUrl })
        : null;
  const text = response.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const expectedPackSeen = test.expectedPack
    ? text.toLowerCase().includes(test.expectedPack.toLowerCase())
    : null;
  console.log(JSON.stringify({
    marketplace: test.marketplace,
    product: test.product,
    expectedPack: test.expectedPack ?? null,
    expectedPackSeen,
    latencyMs,
    bytes: response.html.length,
    finalUrl: response.finalUrl,
    result: parsed ? "parsed" : "html_only",
    title: parsed?.title ?? null,
    priceRaw: parsed?.priceRaw ?? null,
    inStock: parsed?.inStock ?? null,
    source: parsed?.priceSource ?? null,
    hasJsonLd: /application\/ld\+json|id=["']jsonLD/i.test(response.html),
    hasEmbeddedState: /__NEXT_DATA__|__INITIAL_STATE__|apolloState|initialState/i.test(response.html),
  }));
  await new Promise((resolve) => setTimeout(resolve, 250));
}
