import test from "node:test";
import assert from "node:assert/strict";

import { decodeHtmlEntities, stripInvisibleUnicode } from "../src/lib/html-entities";

function scrub(s: string) {
  return stripInvisibleUnicode(decodeHtmlEntities(s));
}

test("decodes numeric ZWSP and strips invisible char", () => {
  assert.equal(scrub("&#8203;22-year-old"), "22-year-old");
});

test("unwinds double-encoded entity", () => {
  assert.equal(scrub("&amp;#8203;Hello"), "Hello");
});

test("unwinds triple-encoded entity", () => {
  assert.equal(scrub("&amp;amp;#8203;X"), "X");
});

test("hex ZWSP", () => {
  assert.equal(scrub("&#x200b;yo"), "yo");
});
