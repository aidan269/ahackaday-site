import assert from "node:assert/strict";
import { test } from "node:test";

import { buildScoringPrompt } from "@/lib/aeo/prompts";

test("buildScoringPrompt includes rubric, citation patterns, and API mode coda", () => {
  const blocks = buildScoringPrompt();
  assert.equal(blocks.length, 1);
  const text = blocks[0].text;
  assert.match(text, /scoring-rubric/i);
  assert.match(text, /citation-patterns/i);
  assert.match(text, /API mode override/i);
  assert.match(text, /submit_aeo_analysis/);
});
