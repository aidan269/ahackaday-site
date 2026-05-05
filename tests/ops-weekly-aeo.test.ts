import assert from "node:assert/strict";
import test from "node:test";

import { buildWeeklyAeoBrief } from "../src/lib/ops-weekly-aeo";
import type { Incident } from "../src/lib/incident-types";

const sampleIncident: Incident = {
  slug: "a",
  title: "Critical zero-day in identity provider",
  date: new Date().toISOString(),
  severity: "critical",
  affected: "identity platform",
  summary: "Active exploitation and credential abuse.",
  category: "identity",
  mitigationStatus: "monitoring",
  sources: ["https://example.test/a"],
  content: "body",
  tldr: "tldr",
  realWorldImpact: "impact",
  whyCare: "care",
  actionItems: ["act"],
  iocs: [],
  ambiguities: [],
  confidenceScore: 0.8,
  evidence: { packages: [], versions: [], cves: [], dates: [], systems: [] },
  exploited: true,
};

test("buildWeeklyAeoBrief returns topics and recommendations", () => {
  const brief = buildWeeklyAeoBrief({
    incidents: [sampleIncident],
    recommendations: [{ title: "Publish answer-first FAQ set", status: "todo" }],
  });
  assert.ok(brief.topics.length >= 1);
  assert.ok(brief.recommendations.length >= 1);
  assert.ok(brief.feedback.length >= 1);
});
