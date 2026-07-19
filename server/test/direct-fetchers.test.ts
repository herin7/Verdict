/**
 * Direct marketplace HTML parsers — fixture only, no live network.
 * Manual smoke: node -e "import('./src/marketplaces/direct/index.js').then(m=>m.fetchAmazonInOffer('B09XS7JWHH').then(console.log))"
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAmazonInHtml } from "../src/marketplaces/direct/amazonIn.js";
import { parseFlipkartHtml } from "../src/marketplaces/direct/flipkart.js";
import {
  extractAsin,
  extractFsn,
  extractFlipkartItemId,
  extractProductIds,
  idsFromProductUrl,
} from "../src/marketplaces/direct/ids.js";
import { normalizeOffer } from "../src/marketplaces/normalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "fixtures");

function testAmazonFixture() {
  const html = fs.readFileSync(path.join(fixtures, "amazon-in-dp-sample.html"), "utf8");
  const offer = parseAmazonInHtml(html, { asin: "B09XS7JWHH" });
  assert.ok(offer, "amazon parse should yield offer");
  assert.equal(offer!.retailerId, "amazon_in");
  assert.match(offer!.priceRaw, /29,?990/);
  assert.ok(!/16,?990/.test(offer!.priceRaw), "related-product price must not win");
  assert.ok(!/34,?990/.test(offer!.priceRaw), "MRP must not win as payable raw");
  assert.equal(offer!.inStock, true);
  assert.ok(/Sony/i.test(offer!.title));

  const normalized = normalizeOffer({
    retailer: offer!.retailer,
    retailerId: offer!.retailerId,
    url: offer!.url,
    title: offer!.title,
    priceRaw: offer!.priceRaw,
    priceContext: offer!.priceContext,
    priceSource: offer!.priceSource,
    fieldPath: offer!.fieldPath,
    currency: offer!.currency,
    defaultCurrency: "INR",
    inStock: offer!.inStock,
    matchScore: 0.9,
    matchReason: "id",
    priceConfidence: 0.92,
  });
  assert.equal(normalized.price, 29990);
  assert.equal(normalized.currency, "INR");

  const mrpOnly = parseAmazonInHtml(
    '<div id="apex_desktop"><span class="basisPrice">M.R.P.: <span class="a-offscreen">₹9,900</span></span></div>',
    { asin: "B0CG4TYW4D" }
  );
  assert.equal(mrpOnly, null, "MRP-only Amazon markup must not become payable");

  const payable = parseAmazonInHtml(
    '<span id="productTitle">Example Shoe</span><div class="priceToPay"><span class="a-offscreen">₹8,450</span></div><span class="basisPrice">M.R.P.: ₹9,900</span>',
    { asin: "B0CG4TYW4D" }
  );
  assert.equal(payable?.priceRaw, "₹8,450", "explicit priceToPay must beat MRP");
}

function testFlipkartFixture() {
  const html = fs.readFileSync(path.join(fixtures, "flipkart-pdp-sample.html"), "utf8");
  const offer = parseFlipkartHtml(html, {
    url: "https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4",
  });
  assert.ok(offer, "flipkart parse should yield offer");
  assert.equal(offer!.retailerId, "flipkart");
  assert.equal(offer!.priceRaw, "58900");
  assert.equal(offer!.currency, "INR");
  assert.equal(offer!.inStock, true);
  assert.ok(/iPhone 15/i.test(offer!.title));
  assert.equal(offer!.priceSource, "json_ld");

  const normalized = normalizeOffer({
    retailer: offer!.retailer,
    retailerId: offer!.retailerId,
    url: offer!.url,
    title: offer!.title,
    priceRaw: offer!.priceRaw,
    priceContext: offer!.priceContext,
    priceSource: offer!.priceSource,
    fieldPath: offer!.fieldPath,
    currency: offer!.currency,
    defaultCurrency: "INR",
    inStock: offer!.inStock,
    matchScore: 0.9,
    matchReason: "id",
    priceConfidence: 0.92,
  });
  assert.equal(normalized.price, 58900);

  const zero = parseFlipkartHtml(
    '<script id="jsonLD" type="application/ld+json">{"@type":"Product","name":"Unavailable","offers":{"@type":"Offer","price":0,"priceCurrency":"INR","availability":"OutOfStock"}}</script><div>₹0</div>',
    { url: "https://www.flipkart.com/unavailable/p/itm0000000000000" }
  );
  assert.equal(zero, null, "zero/unavailable Flipkart price must be omitted");
}

function testIdExtraction() {
  assert.equal(extractAsin("ASIN B09XS7JWHH"), "B09XS7JWHH");
  assert.equal(extractAsin("https://www.amazon.in/dp/B09XS7JWHH/ref=sr"), "B09XS7JWHH");
  assert.equal(extractAsin("asin=B0BDHWDR12"), "B0BDHWDR12");
  assert.equal(extractAsin("no id here"), null);

  assert.equal(
    extractFlipkartItemId("https://www.flipkart.com/foo/p/itm6ac6485515ae4?pid=X"),
    "itm6ac6485515ae4"
  );
  assert.equal(extractFsn("FSN: MOBGTAGPTB3VS24W"), "MOBGTAGPTB3VS24W");
  assert.equal(extractFsn("sku MOBGTAGPTB3VS24W"), "MOBGTAGPTB3VS24W");

  const fromUrl = idsFromProductUrl("https://www.amazon.in/gp/product/B09XS7JWHH");
  assert.equal(fromUrl.asin, "B09XS7JWHH");

  const blended = extractProductIds(
    "Sony headphones",
    "https://www.flipkart.com/x/p/itmabcdef123456",
    "FSN MOBGTAGPTB3VS24W"
  );
  assert.equal(blended.flipkartItemId, "itmabcdef123456");
  assert.equal(blended.fsn, "MOBGTAGPTB3VS24W");
}

function main() {
  testAmazonFixture();
  testFlipkartFixture();
  testIdExtraction();
  console.log("direct-fetchers tests passed");
}

main();
