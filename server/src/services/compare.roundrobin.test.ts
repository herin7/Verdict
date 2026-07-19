import { allocateCandidatesRoundRobin } from "./compare.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const candidates = [
  { marketplaceId: "amazon_in", url: "a1" },
  { marketplaceId: "amazon_in", url: "a2" },
  { marketplaceId: "flipkart", url: "f1" },
  { marketplaceId: "flipkart", url: "f2" },
  { marketplaceId: "blinkit", url: "b1" },
];

const top = allocateCandidatesRoundRobin(candidates, 4);
assert(top.length === 4, "cap respected");
assert(top.slice(0, 3).map((c) => c.marketplaceId).sort().join(",") === "amazon_in,blinkit,flipkart", "first round covers each market");
assert(top[3].marketplaceId === "amazon_in" || top[3].marketplaceId === "flipkart", "second round only after all markets have one");

const all = allocateCandidatesRoundRobin(candidates, 10);
assert(all.length === 5, "cannot exceed available candidates");

console.log("services/compare allocateCandidatesRoundRobin ok");
