import assert from "node:assert/strict";
import test from "node:test";

import { extractIncidentKeywordsForGrace } from "../src/lib/ask-grace-keywords";
import type { Incident } from "../src/lib/incident-types";

function minimalIncident(over: Partial<Incident>): Incident {
  return {
    slug: "test",
    title: "Instructure reaches agreement with ShinyHunters",
    date: "2026-05-01",
    severity: "high",
    affected: "Education SaaS customers",
    summary: "Data leak negotiation and breach response.",
    category: "breach",
    mitigationStatus: "monitoring",
    sources: ["https://example.com"],
    cve: "CVE-2026-9999",
    tldr: "Third-party extortion group involved.",
    realWorldImpact: "",
    whyCare: "",
    actionItems: [],
    iocs: ["shinyhunters.example"],
    ambiguities: [],
    confidenceScore: 0.5,
    evidence: { packages: [], versions: [], cves: ["CVE-2026-9999"], dates: [], systems: ["AWS"] },
    exploited: false,
    content: "Instructure Canvas cloud and student data exposure discussed.",
    ...over,
  } as Incident;
}

test("extractIncidentKeywordsForGrace picks CVEs and substantive tokens", () => {
  const k = extractIncidentKeywordsForGrace(minimalIncident({}));
  assert.ok(k.some((x) => x === "CVE-2026-9999"));
  assert.ok(k.some((x) => /instructure/i.test(x)));
  assert.ok(k.some((x) => /shinyhunters/i.test(x)));
});
