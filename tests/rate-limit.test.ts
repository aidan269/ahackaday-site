import assert from "node:assert/strict";
import test from "node:test";

import { deriveRateLimitKey, takeRateLimit } from "../src/lib/rate-limit";

test("takeRateLimit blocks after max within window", () => {
  const key = `unit-${Date.now()}-a`;
  const first = takeRateLimit(key, { max: 2, windowMs: 10_000 });
  const second = takeRateLimit(key, { max: 2, windowMs: 10_000 });
  const third = takeRateLimit(key, { max: 2, windowMs: 10_000 });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(third.ok, false);
  assert.equal(third.remaining, 0);
  assert.ok(third.retryAfterSeconds >= 1);
});

test("deriveRateLimitKey prefers x-forwarded-for", () => {
  const req = new Request("https://example.test/api/ask-ai", {
    headers: {
      "x-forwarded-for": "203.0.113.10, 70.1.2.3",
      "user-agent": "UnitAgent/1.0",
    },
  });
  const key = deriveRateLimitKey(req);
  assert.ok(key.startsWith("203.0.113.10::"));
});
