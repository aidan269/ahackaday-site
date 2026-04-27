import test from "node:test";
import assert from "node:assert/strict";

import { classifyIncidentTypeFromText, inferExploitedSignal } from "../src/lib/incidents";

test("classifies supply-chain worm correctly", () => {
  const text =
    "A malicious npm package dependency spread as a supply chain worm across CI pipelines and internal build systems.";
  assert.equal(classifyIncidentTypeFromText(text), "supply-chain");
});

test("does not classify false zero-day without explicit exploitation evidence", () => {
  const text =
    "Researchers discussed a potential zero-day in a browser renderer. No evidence of active exploitation was reported.";
  assert.notEqual(classifyIncidentTypeFromText(text), "zero-day");
  assert.equal(inferExploitedSignal(text), false);
});

test("keeps benign advisory in medium/high-confidence non-exploited bucket", () => {
  const text =
    "Vendor advisory: medium severity update for optional telemetry module. Patch available and no active exploit observed.";
  assert.equal(inferExploitedSignal(text), false);
  assert.notEqual(classifyIncidentTypeFromText(text), "zero-day");
});
