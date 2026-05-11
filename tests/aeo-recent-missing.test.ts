import assert from "node:assert/strict";
import { test } from "node:test";

import { takeMissingFromRecentOrder } from "@/lib/aeo/backfill";

test("takeMissingFromRecentOrder prefers newest order and caps take", () => {
  const have = new Set(["b", "d"]);
  assert.deepEqual(takeMissingFromRecentOrder(["a", "b", "c", "d", "e"], have, 2), ["a", "c"]);
  assert.deepEqual(takeMissingFromRecentOrder(["x", "y"], have, 5), ["x", "y"]);
});
