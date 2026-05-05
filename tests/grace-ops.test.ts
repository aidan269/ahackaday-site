import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildGraceWeeklyPayload,
  fetchDailyAeoDigest,
  fetchIncidentState,
  forwardRecommendationAction,
  generateIncidentKey,
  normalizeIncidentUrl,
  resolveGraceWorkspaceId,
  runIncident,
} from "../src/lib/grace-ops";

const realFetch = global.fetch;

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("incident key normalization is deterministic", () => {
  const base = "https://AHackaday.news/incident/x/?utm_source=x&utm_campaign=y";
  const normalized = normalizeIncidentUrl(base);
  assert.equal(normalized, "https://ahackaday.news/incident/x");
  const a = generateIncidentKey({ incidentUrl: base, publishedAt: "2026-05-01T00:00:00.000Z" });
  const b = generateIncidentKey({ incidentUrl: "https://ahackaday.news/incident/x/", publishedAt: "2026-05-01T00:00:00.000Z" });
  assert.equal(a, b);
});

test("payload builder dedupes and keeps absolute urls", () => {
  const payload = buildGraceWeeklyPayload({
    incidentKey: "inc_123",
    incidentUrl: "https://example.test/a/",
    incidentTitle: "Critical CVE incident",
    severity: "critical",
    relatedUrls: ["https://example.test/a", "https://example.test/b?utm_source=x", "/relative/path"],
    tags: ["cloud", "cve"],
    workspaceId: "ws_1",
  });
  assert.equal(payload.url_buckets.selected_count, 2);
  assert.deepEqual(payload.url_buckets.primary, ["https://example.test/a"]);
  assert.deepEqual(payload.url_buckets.related, ["https://example.test/b"]);
});

test("workspace resolver falls back to default workspace when mapping is missing", async () => {
  process.env.GRACE_WORKSPACE_MAP_JSON = "{}";
  const workspaceId = await resolveGraceWorkspaceId("tenant_missing");
  assert.equal(workspaceId, "default");
});

test("run trigger succeeds and returns run id", async () => {
  process.env.GRACE_SERVICE_ORIGIN = "https://grace.example.test";
  process.env.GRACE_SERVICE_API_KEY = "secret";
  process.env.GRACE_WORKSPACE_MAP_JSON = JSON.stringify({ tenant_a: "ws_a" });
  global.fetch = async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith("/api/grace-weekly")) {
      return mockJsonResponse({ run_id: "run_123", status: "queued" });
    }
    throw new Error(`unexpected url: ${url}`);
  };
  const result = await runIncident({
    incidentKey: "inc_1",
    incidentUrl: "https://example.test/inc",
    incidentTitle: "Incident",
    severity: "high",
    tenantId: "tenant_a",
  });
  assert.equal(result.run_id, "run_123");
  assert.equal(result.status, "queued");
});

test("run trigger surfaces failure after retries", async () => {
  process.env.GRACE_SERVICE_ORIGIN = "https://grace.example.test";
  process.env.GRACE_SERVICE_API_KEY = "secret";
  process.env.GRACE_WORKSPACE_MAP_JSON = JSON.stringify({ tenant_a: "ws_a" });
  global.fetch = async () => mockJsonResponse({ error: "down" }, 503);
  await assert.rejects(() => runIncident({
    incidentKey: "inc_2",
    incidentUrl: "https://example.test/inc2",
    incidentTitle: "Incident 2",
    severity: "high",
    tenantId: "tenant_a",
  }));
});

test("recommendation action forwarding returns refreshed state", async () => {
  process.env.GRACE_SERVICE_ORIGIN = "https://grace.example.test";
  process.env.GRACE_SERVICE_API_KEY = "secret";
  process.env.GRACE_WORKSPACE_MAP_JSON = JSON.stringify({ tenant_a: "ws_a" });
  global.fetch = async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith("/api/grace-approvals")) return mockJsonResponse({ ok: true });
    if (url.includes("/api/grace-report")) {
      return mockJsonResponse({
        north_star: 77,
        answer_inclusion: 81,
        freshness: 91,
        open_actions: 3,
        recommendations: [{ id: "r1", title: "Patch edge nodes", status: "accepted" }],
        runs: [{ run_id: "run_44", status: "completed", created_at: "2026-05-05T10:00:00.000Z", origin: "ahackaday" }],
        extracted_indicators: ["CVE-2026-12345"],
      });
    }
    throw new Error(`unexpected url: ${url}`);
  };
  const state = await forwardRecommendationAction({
    recommendationId: "r1",
    nextStatus: "accepted",
    actor: "analyst@test",
    incidentKey: "inc_3",
    tenantId: "tenant_a",
  });
  assert.equal(state.top_recommendation?.status, "accepted");
  assert.equal(state.latest_run?.status, "completed");
});

test("incident state falls back to stale cache when grace unavailable", async () => {
  process.env.GRACE_SERVICE_ORIGIN = "https://grace.example.test";
  process.env.GRACE_SERVICE_API_KEY = "secret";
  global.fetch = async () => mockJsonResponse({
    north_star: 61,
    answer_inclusion: 65,
    freshness: 60,
    open_actions: 2,
    recommendations: [{ id: "r2", title: "Rotate credentials", status: "todo" }],
    runs: [{ run_id: "run_12", status: "started", created_at: "2026-05-05T10:00:00.000Z", origin: "ahackaday" }],
    extracted_indicators: ["evil.example"],
  });
  const warm = await fetchIncidentState({ incidentKey: "inc_cached", workspaceId: "ws_a" });
  assert.equal(warm.stale, false);

  global.fetch = async () => {
    throw new Error("network down");
  };
  const fallback = await fetchIncidentState({ incidentKey: "inc_cached", workspaceId: "ws_a" });
  assert.equal(fallback.stale, true);
  assert.equal(fallback.kpis.north_star, 61);
});

test("daily digest fetch maps digest_date and opportunities", async () => {
  process.env.GRACE_SERVICE_ORIGIN = "https://grace.example.test";
  process.env.GRACE_WORKSPACE_MAP_JSON = JSON.stringify({ tenant_a: "ws_a" });
  global.fetch = async (input: string | URL) => {
    const url = String(input);
    if (url.includes("/api/ops/weekly-aeo")) {
      return mockJsonResponse({
        week_of: "2026-05-05",
        generated_at: "2026-05-05T00:00:00.000Z",
        topics: ["identity"],
        opportunities: ["identity: rising now (2 AHackaday signals vs 0 Cantina hits)"],
        recommendations: ["Publish an answer-first brief for identity."],
        feedback: ["Daily digest seed: Identity provider exploit update"],
      });
    }
    throw new Error(`unexpected url: ${url}`);
  };

  const digest = await fetchDailyAeoDigest({ tenantId: "tenant_a" });
  assert.equal(digest.digest_date, "2026-05-05");
  assert.ok(digest.opportunities.length >= 1);
});

test("known-good incident-state fixture contains Grace recommendation payload", () => {
  const fixturePath = path.join(process.cwd(), "tests/fixtures/grace-incident-state.good.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    ok: boolean;
    state: {
      top_recommendation: { id: string; title: string; status: string } | null;
      recommendation_counts_by_status: Record<string, number>;
      kpis: { north_star: number; answer_inclusion: number; freshness: number; open_actions: number };
    };
  };
  assert.equal(fixture.ok, true);
  assert.ok(fixture.state.top_recommendation);
  assert.ok(fixture.state.recommendation_counts_by_status.todo >= 1);
  assert.ok(fixture.state.kpis.freshness >= 1);
});

test("known-good daily digest fixture contains marketing digest payload", () => {
  const fixturePath = path.join(process.cwd(), "tests/fixtures/grace-daily-aeo.good.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    ok: boolean;
    brief: {
      digest_date: string;
      opportunities: string[];
      recommendations: string[];
      feedback: string[];
    };
  };
  assert.equal(fixture.ok, true);
  assert.ok(fixture.brief.digest_date.length > 0);
  assert.ok(fixture.brief.opportunities.length >= 1);
  assert.ok(fixture.brief.recommendations.length >= 1);
  assert.ok(fixture.brief.feedback.length >= 1);
});

test.after(() => {
  global.fetch = realFetch;
});
