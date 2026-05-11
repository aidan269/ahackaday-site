import assert from "node:assert/strict";
import { test } from "node:test";

import { buildIncidentPageTextForScoring } from "@/lib/aeo/incident-content";
import type { Incident } from "@/lib/incident-types";

function minimalIncident(over: Partial<Incident>): Incident {
  const emptyEvidence = { packages: [], versions: [], cves: [], dates: [], systems: [] };
  return {
    title: "T",
    date: "2026-05-01T00:00:00Z",
    severity: "medium",
    affected: "a",
    summary: "s",
    category: "other",
    mitigationStatus: "m",
    sources: ["https://example.com"],
    slug: "x",
    content: "Body para.",
    tldr: "s",
    realWorldImpact: "rwi",
    whyCare: "wc",
    actionItems: ["Do A"],
    iocs: ["hash:abc"],
    ambiguities: ["unclear vendor"],
    confidenceScore: 0.5,
    evidence: emptyEvidence,
    exploited: false,
    ...over,
  } as Incident;
}

test("buildIncidentPageTextForScoring puts CVEs and IOCs before body", () => {
  const text = buildIncidentPageTextForScoring(
    minimalIncident({
      title: "ACME widget flaw",
      summary: "Remote code in widget.",
      evidence: {
        packages: ["acme-widget"],
        versions: ["2.1"],
        cves: ["CVE-2026-12345"],
        dates: [],
        systems: ["Linux edge"],
      },
      cve: "CVE-2026-12345",
      iocs: ["mutex:evil"],
      actionItems: ["Patch to 2.2"],
    }),
  );
  const bodyIdx = text.indexOf("--- Full article body ---");
  const cveIdx = text.indexOf("CVE-2026-12345");
  const iocIdx = text.indexOf("mutex:evil");
  assert.ok(bodyIdx > 0 && cveIdx > 0 && iocIdx > 0);
  assert.ok(cveIdx < bodyIdx, "CVE should appear before full body section");
  assert.ok(iocIdx < bodyIdx, "IOC should appear before full body section");
  assert.ok(text.includes("Evidence packages: acme-widget"));
});

test("buildIncidentPageTextForScoring skips TL;DR when same as summary", () => {
  const text = buildIncidentPageTextForScoring(
    minimalIncident({
      summary: "Same text",
      tldr: "Same text",
    }),
  );
  assert.equal(text.includes("TL;DR:"), false);
});
