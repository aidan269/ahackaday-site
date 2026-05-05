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

test("buildWeeklyAeoBrief adds opportunity angles from trend gaps", () => {
  const nowIso = new Date().toISOString();
  const nonCantinaTrend: Incident = {
    ...sampleIncident,
    slug: "trend",
    title: "Cloud runtime hardening for zero-day response",
    summary: "Growing social conversation around cloud hardening and runtime controls.",
    category: "cloud",
    socialMentions24h: 120,
    socialDelta24hPct: 22,
    socialTrend: "up",
    sources: ["https://www.ahackaday.news/incident/trend"],
    date: nowIso,
  };
  const cantinaCoverage: Incident = {
    ...sampleIncident,
    slug: "cantina",
    title: "Cantina post on secure code review",
    category: "appsec",
    summary: "Steady security engineering update.",
    socialMentions24h: 12,
    socialDelta24hPct: 0,
    socialTrend: "flat",
    sources: ["https://cantina.security/blog/secure-code-review"],
    date: nowIso,
  };
  const brief = buildWeeklyAeoBrief({ incidents: [nonCantinaTrend, nonCantinaTrend, cantinaCoverage] });
  assert.ok(
    brief.recommendations.some((line) => line.toLowerCase().includes("angle to own")),
    "expected a trend-gap recommendation angle",
  );
  assert.ok(
    brief.feedback.some((line) => line.toLowerCase().includes("daily digest seed")),
    "expected daily digest seeds in feedback",
  );
});
