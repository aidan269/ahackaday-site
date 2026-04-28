import assert from "node:assert/strict";
import test from "node:test";

import {
  checkApiRateLimit,
  getHealthFromData,
  getIncidentDetailFromData,
  getIncidentListFromData,
  getStatsFromData,
  parseIncidentsQuery,
} from "../src/lib/api-v1";
import type { Incident } from "../src/lib/incident-types";

const sampleIncidents: Incident[] = [
  {
    slug: "alpha",
    title: "Alpha critical issue",
    date: "2026-04-20",
    severity: "critical",
    affected: "Infra",
    summary: "Critical issue.",
    category: "cloud",
    mitigationStatus: "Monitoring",
    sources: ["https://example.test/a"],
    content: "Details",
    tldr: "Critical issue.",
    realWorldImpact: "High impact",
    whyCare: "You should care",
    actionItems: ["Patch"],
    iocs: [],
    ambiguities: [],
    confidenceScore: 0.9,
    evidence: { packages: [], versions: [], cves: [], dates: [], systems: [] },
    exploited: true,
  },
  {
    slug: "beta",
    title: "Beta high issue",
    date: "2026-04-19",
    severity: "high",
    affected: "Apps",
    summary: "High issue.",
    category: "identity",
    mitigationStatus: "Resolved",
    sources: ["https://example.test/b"],
    content: "Details",
    tldr: "High issue.",
    realWorldImpact: "Medium impact",
    whyCare: "You should care",
    actionItems: ["Rotate keys"],
    iocs: [],
    ambiguities: [],
    confidenceScore: 0.8,
    evidence: { packages: [], versions: [], cves: [], dates: [], systems: [] },
    exploited: false,
  },
  {
    slug: "gamma",
    title: "Gamma medium issue",
    date: "2026-04-18",
    severity: "medium",
    affected: "Users",
    summary: "Medium issue.",
    category: "web",
    mitigationStatus: "Patched",
    sources: ["https://example.test/c"],
    content: "Details",
    tldr: "Medium issue.",
    realWorldImpact: "Low impact",
    whyCare: "You should care",
    actionItems: ["Review"],
    iocs: [],
    ambiguities: [],
    confidenceScore: 0.7,
    evidence: { packages: [], versions: [], cves: [], dates: [], systems: [] },
    exploited: false,
  },
];

test("parseIncidentsQuery normalizes params", () => {
  const url = new URL("https://example.test/api/v1/incidents?severity=critical&category=cloud&window=7&limit=5&q=vpn");
  const parsed = parseIncidentsQuery(url);
  assert.equal(parsed.severity, "critical");
  assert.equal(parsed.category, "cloud");
  assert.equal(parsed.window, "7d");
  assert.equal(parsed.limit, 5);
  assert.equal(parsed.q, "vpn");
});

test("getIncidentListPayload returns paginated items and cursor", async () => {
  const first = getIncidentListFromData(sampleIncidents, new URL("https://example.test/api/v1/incidents?limit=2"));
  assert.ok(!("error" in first));
  assert.equal(first.items.length, 2);
  assert.ok(first.next_cursor);

  const second = getIncidentListFromData(
    sampleIncidents,
    new URL(`https://example.test/api/v1/incidents?limit=2&cursor=${encodeURIComponent(first.next_cursor!)}`),
  );
  assert.ok(!("error" in second));
  assert.equal(second.items.length, 1);
  assert.notEqual(second.items[0]!.slug, first.items[0]!.slug);
});

test("getIncidentListPayload rejects malformed cursor", async () => {
  const payload = getIncidentListFromData(
    sampleIncidents,
    new URL("https://example.test/api/v1/incidents?cursor=not-a-valid-cursor"),
  );
  assert.ok("error" in payload);
  assert.equal(payload.status, 400);
});

test("getIncidentDetailPayload returns 404 for unknown slug", async () => {
  const payload = getIncidentDetailFromData(null);
  assert.ok("error" in payload);
  assert.equal(payload.status, 404);
});

test("getStatsPayload returns expected totals keys", async () => {
  const stats = getStatsFromData(sampleIncidents);
  assert.equal(stats.totals.all, 3);
  assert.ok(typeof stats.totals.critical === "number");
  assert.ok(typeof stats.totals.exploited === "number");
  assert.equal(stats.version, "v1");
});

test("getHealthPayload returns basic service metadata", async () => {
  const health = getHealthFromData(sampleIncidents, "markdown");
  assert.equal(health.ok, true);
  assert.ok(typeof health.data_source === "string");
  assert.ok(typeof health.incidents_count === "number");
  assert.equal(health.version, "v1");
});

test("v1 routes enforce rate limiting with 429", async () => {
  let denied = false;
  for (let i = 0; i < 61; i += 1) {
    const req = new Request("https://example.test/api/v1/health", {
      headers: {
        "x-forwarded-for": "203.0.113.177",
        "user-agent": "api-v1-rate-test-unique",
      },
    });
    const quota = checkApiRateLimit(req);
    if (!quota.ok) denied = true;
  }
  assert.equal(denied, true);
});
