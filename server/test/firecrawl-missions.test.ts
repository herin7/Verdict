import assert from "node:assert/strict";
import {
  PRICE_STOCK_TRACKING_SCHEMA,
  buildPriceStockMonitorBody,
} from "../src/firecrawl.js";
import { MissionProposalSchema } from "../src/missions/types.js";

function testBuildMonitorBody() {
  const body = buildPriceStockMonitorBody({
    name: "Watch AirPods",
    urls: ["https://www.amazon.in/dp/B0TEST", "ftp://bad.example"],
    schedule: { text: "every 2 hours", timezone: "UTC" },
    webhookUrl: "https://example.com/webhooks/firecrawl",
    webhookHeaders: { "x-verdict-webhook-secret": "s3cret" },
    metadata: { missionId: "abc" },
  });

  assert.equal(body.name, "Watch AirPods");
  const targets = body.targets as Array<{ type: string; urls: string[] }>;
  assert.equal(targets.length, 1);
  assert.equal(targets[0].type, "scrape");
  assert.deepEqual(targets[0].urls, ["https://www.amazon.in/dp/B0TEST"]);
  assert.ok((body.webhook as { url: string }).url.includes("/webhooks/firecrawl"));
  assert.equal(PRICE_STOCK_TRACKING_SCHEMA.type, "object");
  assert.ok(PRICE_STOCK_TRACKING_SCHEMA.properties.price);
  assert.ok(PRICE_STOCK_TRACKING_SCHEMA.properties.inStock);

  assert.throws(() => buildPriceStockMonitorBody({ name: "x", urls: ["not-a-url"] }), /URL required/);
}

function testProposalAlwaysRequiresApproval() {
  const parsed = MissionProposalSchema.parse({
    summary: "Found offers",
    action: "buy",
    requiresApproval: true,
    buyLinks: [{ retailer: "amazon", url: "https://amazon.in/x", price: "999" }],
    dealsCount: 1,
    offersCount: 3,
    verdict: "buy",
    maxPriceOk: true,
    createdAt: Date.now(),
  });
  assert.equal(parsed.requiresApproval, true);
  assert.equal(parsed.action, "buy");
}

testBuildMonitorBody();
testProposalAlwaysRequiresApproval();
console.log("firecrawl-missions tests ok");
