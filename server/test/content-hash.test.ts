import assert from "node:assert/strict";
import { contentHash } from "../src/shares/process.js";
import { extractProductUrl } from "../src/utils/productUrl.js";

// Same content → same hash (duplicate shares collapse); different content → different hash.
assert.equal(contentHash(["url", "https://amzn.in/d/x"]), contentHash(["url", "https://amzn.in/d/x"]));
assert.notEqual(contentHash(["url", "https://amzn.in/d/x"]), contentHash(["url", "https://amzn.in/d/y"]));
assert.notEqual(contentHash(["image", Buffer.from([1, 2])]), contentHash(["text", "\u0001\u0002"]));

assert.equal(extractProductUrl("Check this https://www.amazon.in/dp/B0C?th=1."), "https://www.amazon.in/dp/B0C?th=1");
assert.equal(extractProductUrl("no link"), null);

console.log("content-hash ok");
