/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { findItem, mergeShares } from "./merge";
import type { InboxItem, ServerShare } from "./types";

const share = (over: Partial<ServerShare>): ServerShare => ({
  id: "s1",
  clientId: "c1",
  kind: "text",
  status: "queued",
  stage: null,
  inputText: "Sony WH-1000XM5",
  inputUrl: null,
  imageUrl: null,
  product: null,
  report: null,
  personal: null,
  error: null,
  createdAt: 100,
  updatedAt: 100,
  ...over,
});

const pending: InboxItem = {
  clientId: "c1",
  createdAt: 50,
  pending: true,
  preview: { text: "local text", localImageUri: "file:///a.jpg" },
  server: null,
};

test("a server row fills in the matching pending item and keeps its preview", () => {
  const [item] = mergeShares([pending], [share({})]);
  assert.equal(item.pending, false);
  assert.equal(item.server?.id, "s1");
  assert.equal(item.createdAt, 50);
  assert.equal(item.preview.localImageUri, "file:///a.jpg");
});

test("server-only rows are added, newest first", () => {
  const items = mergeShares([pending], [share({ id: "s2", clientId: "c2", createdAt: 900, inputUrl: "https://x.y" })]);
  assert.deepEqual(items.map((i) => i.clientId), ["c2", "c1"]);
  assert.equal(items[0].preview.text, "Sony WH-1000XM5");
});

test("an older server copy never overwrites a newer one", () => {
  const ready = mergeShares([pending], [share({ status: "ready", updatedAt: 300 })]);
  const [item] = mergeShares(ready, [share({ status: "researching", updatedAt: 200 })]);
  assert.equal(item.server?.status, "ready");
});

test("findItem matches by server id or clientId", () => {
  const items = mergeShares([pending], [share({})]);
  assert.equal(findItem(items, "s1")?.clientId, "c1");
  assert.equal(findItem(items, "c1")?.server?.id, "s1");
  assert.equal(findItem(items, "nope"), undefined);
});
