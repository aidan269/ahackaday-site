import test from "node:test";
import assert from "node:assert/strict";

import { truncateForDisplay } from "../src/lib/truncate-display";

test("returns short string unchanged", () => {
  assert.equal(truncateForDisplay("Apache", 80), "Apache");
});

test("fit as many whole words as allowed", () => {
  assert.equal(
    truncateForDisplay("The organization network and staff in region A", 32),
    "The organization network and…",
  );
});

test("stops on full words under max length", () => {
  assert.equal(
    truncateForDisplay("Users of the Foo service in production", 22),
    "Users of the Foo…",
  );
});

test("overlong first token is hard-capped with ellipsis", () => {
  const long = "a".repeat(100);
  assert.equal(truncateForDisplay(long, 12), `${"a".repeat(12)}…`);
});
