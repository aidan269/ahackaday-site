import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractBylineFromSummary,
  filterBodyParagraphs,
  firstSentence,
  isBoilerplateParagraph,
  shouldSuppressAllBodyText,
} from "@/lib/incident-detail-display";

test("extractBylineFromSummary splits blank-line-separated byline", () => {
  const raw = "By Rich Perkins, Principal Sales Engineer, Prophet Security\n\nCustomers saw suspicious MFA prompts.";
  const { byline, lede } = extractBylineFromSummary(raw);
  assert.ok(byline?.includes("Rich Perkins"));
  assert.ok(lede.includes("MFA"));
});

test("shouldSuppressAllBodyText when short", () => {
  assert.equal(shouldSuppressAllBodyText("Short.", "Some Long Incident Title Here"), true);
});

test("shouldSuppressAllBodyText when headline echoed", () => {
  const h = "Acme vuln disclosure affects SOC tooling";
  const body = `Lead intro. ${h} continued with more text that makes length over two hundred characters ` + "x".repeat(120);
  assert.equal(shouldSuppressAllBodyText(body, h), true);
});

test("filterBodyParagraphs removes boilerplate", () => {
  const headline = "Example CVE in prod dependency";
  const lede = "Supply chain risk escalates when upstream patches lag.";
  const filler =
    "Operational teams should inventory affected packages and verify SBOM coverage across CI/CD. ".repeat(5);
  const paras = [
    "The incident may affect systems related to Example. Source details are limited.",
    filler.trim(),
  ];
  const out = filterBodyParagraphs(paras, headline, firstSentence(lede));
  assert.equal(out.length, 1);
  assert.ok(out[0]?.includes("inventory"));
});

test("isBoilerplateParagraph detects ingest template", () => {
  assert.equal(
    isBoilerplateParagraph(
      "The incident may affect systems related to Foo. Source details are limited pending vendor confirmation.",
    ),
    true,
  );
});
