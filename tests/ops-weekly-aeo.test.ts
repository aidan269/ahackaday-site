import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDailyAeoDigest,
  mergeGraceAndLocalDigests,
} from "../src/lib/ops-weekly-aeo";
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

test("buildDailyAeoDigest returns v2 themes, opportunity items, and recommendations", () => {
  const brief = buildDailyAeoDigest({
    incidents: [sampleIncident, { ...sampleIncident, slug: "b", sources: ["https://example.test/b"] }],
    recommendations: [{ title: "Publish answer-first FAQ set", status: "todo" }],
  });
  assert.equal(brief.version, 2);
  assert.ok(brief.themes.length >= 1);
  assert.ok(!brief.themes.some((t) => t === "critical" || t === "high"), "severity tokens must not headline themes list");
  assert.ok(brief.opportunity_items.length >= 1);
  assert.ok(brief.recommendation_items.length >= 1);
  assert.ok(brief.feedback.length >= 1);
  assert.ok(brief.opportunities.length >= 1);
});

test("buildDailyAeoDigest surfaces Cantina contrast in opportunity copy", () => {
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
  const brief = buildDailyAeoDigest({ incidents: [nonCantinaTrend, nonCantinaTrend, cantinaCoverage] });
  assert.ok(
    brief.opportunity_items.some((o) => o.why_now.toLowerCase().includes("cantina")),
    "expected Cantina contrast in structured opportunity",
  );
  assert.ok(
    brief.feedback.some((line) => line.toLowerCase().includes("top story momentum")),
    "expected momentum notes in feedback",
  );
});

test("mergeGraceAndLocalDigests prefers hybrid when grace contributes feedback", () => {
  const local = buildDailyAeoDigest({
    incidents: [sampleIncident, { ...sampleIncident, slug: "x" }],
  });
  const grace = {
    ...local,
    feedback: ["Grace-only nuance: tighten entity definitions for AI snippets."],
    opportunity_items: [],
    recommendation_items: [],
    opportunities: [],
    recommendations: [],
  };
  const merged = mergeGraceAndLocalDigests({ local, grace });
  assert.equal(merged.source_mode, "hybrid");
  assert.ok(merged.brief.feedback.some((f) => f.includes("Grace-only")));
});
