import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldSkipAeoRescore } from "@/lib/aeo/score";

test("skip when hash matches and scored within 7 days", () => {
  const now = new Date("2026-05-07T12:00:00Z").getTime();
  assert.equal(
    shouldSkipAeoRescore({
      lastContentHash: "abc",
      lastScoredAt: "2026-05-06T12:00:00Z",
      contentHash: "abc",
      nowMs: now,
    }),
    true,
  );
});

test("do not skip when hash changes", () => {
  const now = new Date("2026-05-07T12:00:00Z").getTime();
  assert.equal(
    shouldSkipAeoRescore({
      lastContentHash: "abc",
      lastScoredAt: "2026-05-06T12:00:00Z",
      contentHash: "def",
      nowMs: now,
    }),
    false,
  );
});

test("do not skip when score older than 7 days", () => {
  const now = new Date("2026-05-07T12:00:00Z").getTime();
  assert.equal(
    shouldSkipAeoRescore({
      lastContentHash: "abc",
      lastScoredAt: "2026-04-20T12:00:00Z",
      contentHash: "abc",
      nowMs: now,
    }),
    false,
  );
});
