import { createHash, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import type { Severity } from "@/lib/incident-types";

const INCIDENT_STATE_STALE_MS = 1000 * 60 * 15;
const INCIDENT_STATE_CACHE_TTL_MS = 1000 * 60 * 20;
const WORKSPACE_CACHE_TTL_MS = 1000 * 60 * 5;

type RecommendationStatus = "todo" | "accepted" | "rejected" | "in_progress" | "done";
type RunStatus = "queued" | "started" | "completed" | "failed";

export type GraceIncidentState = {
  incident_key: string;
  kpis: {
    north_star: number;
    answer_inclusion: number;
    freshness: number;
    open_actions: number;
  };
  top_recommendation: {
    id: string;
    title: string;
    status: RecommendationStatus;
  } | null;
  recommendation_counts_by_status: Record<string, number>;
  latest_run: {
    run_id: string;
    status: RunStatus;
    created_at: string;
    origin: string;
  } | null;
  stale: boolean;
  ioc_count: number;
  extracted_indicators: string[];
};

type IncidentStateCacheEntry = {
  state: GraceIncidentState;
  cachedAt: number;
};

type WorkspaceCacheEntry = {
  workspaceId: string;
  expiresAt: number;
};

const incidentStateCache = new Map<string, IncidentStateCacheEntry>();
const workspaceCache = new Map<string, WorkspaceCacheEntry>();

export class WorkspaceMappingError extends Error {
  readonly code = "workspace_mapping_missing";
}

export class GraceOpsConfigError extends Error {
  readonly code = "grace_ops_config_error";
}

export function isOpsPackGraceEnabled(): boolean {
  return process.env.OPS_PACK_GRACE_ENABLED === "1";
}

export function isOpsPackGraceRollbackEnabled(): boolean {
  return process.env.OPS_PACK_GRACE_ROLLBACK_ENABLED === "1";
}

export function isOpsPackGraceParallelValidateEnabled(): boolean {
  return process.env.OPS_PACK_GRACE_PARALLEL_VALIDATE === "1";
}

export function normalizeIncidentUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hostname = url.hostname.toLowerCase();
  url.protocol = url.protocol.toLowerCase();
  url.hash = "";
  const blockedParams = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]);
  for (const key of Array.from(url.searchParams.keys())) {
    if (key.toLowerCase().startsWith("utm_") || blockedParams.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  url.pathname = normalizedPath;
  return url.toString();
}

export function generateIncidentKey(input: { incidentUrl: string; publishedAt?: string | null }): string {
  const normalized = normalizeIncidentUrl(input.incidentUrl);
  const material = `${normalized}|${input.publishedAt ?? ""}`;
  const digest = createHash("sha256").update(material).digest("hex").slice(0, 24);
  return `inc_${digest}`;
}

function getTenantId(explicitTenantId?: string): string {
  return explicitTenantId?.trim() || process.env.AHACKADAY_TENANT_ID?.trim() || "default";
}

function getGraceOrigin(): string {
  const origin = process.env.GRACE_SERVICE_ORIGIN?.trim();
  if (!origin) {
    throw new GraceOpsConfigError("Missing GRACE_SERVICE_ORIGIN");
  }
  return origin.replace(/\/$/, "");
}

function getGraceApiKey(): string {
  const key = process.env.GRACE_SERVICE_API_KEY?.trim();
  if (!key) {
    throw new GraceOpsConfigError("Missing GRACE_SERVICE_API_KEY");
  }
  return key;
}

function getWorkspaceMappingFromEnv(tenantId: string): string | null {
  const mapRaw = process.env.GRACE_WORKSPACE_MAP_JSON?.trim();
  if (!mapRaw) return null;
  try {
    const parsed = JSON.parse(mapRaw) as Record<string, string>;
    return parsed[tenantId] ?? null;
  } catch {
    return null;
  }
}

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function resolveGraceWorkspaceId(explicitTenantId?: string): Promise<string> {
  const tenantId = getTenantId(explicitTenantId);
  const now = Date.now();
  const cached = workspaceCache.get(tenantId);
  if (cached && cached.expiresAt > now) {
    return cached.workspaceId;
  }

  const envMapped = getWorkspaceMappingFromEnv(tenantId);
  if (envMapped) {
    workspaceCache.set(tenantId, { workspaceId: envMapped, expiresAt: now + WORKSPACE_CACHE_TTL_MS });
    return envMapped;
  }

  const supabase = getSupabaseAdminClient();
  if (supabase) {
    const { data } = await supabase
      .from("grace_workspace_mappings")
      .select("grace_workspace_id")
      .eq("ahackaday_tenant_id", tenantId)
      .maybeSingle();
    const mapped = data?.grace_workspace_id;
    if (typeof mapped === "string" && mapped.trim()) {
      workspaceCache.set(tenantId, { workspaceId: mapped, expiresAt: now + WORKSPACE_CACHE_TTL_MS });
      return mapped;
    }
  }

  throw new WorkspaceMappingError(`Missing Grace workspace mapping for tenant '${tenantId}'`);
}

function getCorrelationIds(input: {
  requestId?: string;
  incidentKey?: string;
  workspaceId?: string;
  runId?: string;
}) {
  return {
    request_id: input.requestId ?? randomUUID(),
    incident_key: input.incidentKey ?? null,
    workspace_id: input.workspaceId ?? null,
    run_id: input.runId ?? null,
  };
}

function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  extra: Record<string, unknown>,
) {
  const payload = { level, event, ts: new Date().toISOString(), ...extra };
  if (level === "error") {
    console.error(JSON.stringify(payload));
  } else if (level === "warn") {
    console.warn(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function graceFetch<T>(
  path: string,
  init: RequestInit,
  correlation: ReturnType<typeof getCorrelationIds>,
): Promise<T> {
  const origin = getGraceOrigin();
  const key = getGraceApiKey();
  const started = Date.now();
  const retries = 3;
  let attempt = 0;
  let lastError: unknown;

  while (attempt < retries) {
    attempt += 1;
    try {
      const response = await fetch(`${origin}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "x-request-id": correlation.request_id,
          ...(init.headers ?? {}),
        },
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        if (response.status >= 500 && attempt < retries) {
          await sleep(120 * (2 ** (attempt - 1)));
          continue;
        }
        throw new Error(`Grace ${path} failed: ${response.status} ${body}`);
      }
      const elapsed = Date.now() - started;
      logEvent("info", "grace_api_latency_ms", {
        ...correlation,
        endpoint: path,
        attempt,
        latency_ms: elapsed,
        status: "ok",
      });
      return await response.json() as T;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(120 * (2 ** (attempt - 1)));
        continue;
      }
    }
  }

  logEvent("error", "grace_api_error", {
    ...correlation,
    endpoint: path,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function normalizeStatus(value: string | undefined): RecommendationStatus {
  const normalized = (value ?? "todo").toLowerCase();
  if (
    normalized === "todo"
    || normalized === "accepted"
    || normalized === "rejected"
    || normalized === "in_progress"
    || normalized === "done"
  ) return normalized;
  return "todo";
}

function normalizeRunStatus(value: string | undefined): RunStatus {
  const normalized = (value ?? "queued").toLowerCase();
  if (normalized === "queued" || normalized === "started" || normalized === "completed" || normalized === "failed") {
    return normalized;
  }
  return "queued";
}

function toCompactIncidentState(input: {
  incidentKey: string;
  report: unknown;
  stale: boolean;
}): GraceIncidentState {
  const report = (input.report && typeof input.report === "object")
    ? input.report as Record<string, unknown>
    : {};
  const recommendations = Array.isArray(report.recommendations)
    ? report.recommendations as Array<Record<string, unknown>>
    : [];
  const runs = Array.isArray(report.runs) ? report.runs as Array<Record<string, unknown>> : [];
  const indicators = Array.isArray(report.extracted_indicators)
    ? report.extracted_indicators.filter((item): item is string => typeof item === "string")
    : [];
  const topRecommendation = recommendations[0];
  const counts: Record<string, number> = {};
  for (const rec of recommendations) {
    const status = normalizeStatus(typeof rec.status === "string" ? rec.status : undefined);
    counts[status] = (counts[status] ?? 0) + 1;
  }
  const latestRun = runs[0];
  return {
    incident_key: input.incidentKey,
    kpis: {
      north_star: Number(report.north_star ?? 0),
      answer_inclusion: Number(report.answer_inclusion ?? 0),
      freshness: Number(report.freshness ?? 0),
      open_actions: Number(report.open_actions ?? 0),
    },
    top_recommendation: topRecommendation
      ? {
        id: String(topRecommendation.id ?? ""),
        title: String(topRecommendation.title ?? "Untitled recommendation"),
        status: normalizeStatus(typeof topRecommendation.status === "string" ? topRecommendation.status : undefined),
      }
      : null,
    recommendation_counts_by_status: counts,
    latest_run: latestRun
      ? {
        run_id: String(latestRun.run_id ?? latestRun.id ?? ""),
        status: normalizeRunStatus(typeof latestRun.status === "string" ? latestRun.status : undefined),
        created_at: String(latestRun.created_at ?? new Date().toISOString()),
        origin: String(latestRun.origin ?? "unknown"),
      }
      : null,
    stale: input.stale,
    ioc_count: indicators.length,
    extracted_indicators: indicators,
  };
}

function getTopicCluster(title: string, tags: string[]): string[] {
  const fromTitle = title
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((value) => value.length > 3)
    .slice(0, 6);
  const fromTags = tags.map((tag) => tag.toLowerCase().trim()).filter(Boolean).slice(0, 6);
  return Array.from(new Set([...fromTags, ...fromTitle])).slice(0, 8);
}

function dedupeAbsoluteUrls(urls: string[]): string[] {
  const valid = new Set<string>();
  for (const url of urls) {
    try {
      const normalized = normalizeIncidentUrl(url);
      if (/^https?:\/\//.test(normalized)) valid.add(normalized);
    } catch {
      // Ignore invalid URLs.
    }
  }
  return Array.from(valid);
}

function computeMetricsProxy(input: {
  severity: Severity;
  relatedCount: number;
  freshnessHintMinutes: number;
}) {
  const severityBase: Record<Severity, number> = {
    critical: 85,
    high: 70,
    medium: 50,
    low: 30,
    unclassified: 25,
  };
  const base = severityBase[input.severity] ?? 50;
  const relatedLift = Math.min(15, input.relatedCount * 3);
  const freshnessPenalty = Math.min(20, Math.floor(input.freshnessHintMinutes / 30));
  return {
    non_zero_signal: Math.max(1, base + relatedLift - freshnessPenalty),
    related_coverage: Math.max(1, relatedLift || 1),
    freshness_score: Math.max(1, 100 - freshnessPenalty),
  };
}

export function buildGraceWeeklyPayload(input: {
  incidentKey: string;
  incidentUrl: string;
  incidentTitle: string;
  severity: Severity;
  relatedUrls?: string[];
  tags?: string[];
  workspaceId: string;
  workspaceName?: string;
  timezone?: string;
}) {
  const allUrls = dedupeAbsoluteUrls([input.incidentUrl, ...(input.relatedUrls ?? [])]);
  const domain = new URL(normalizeIncidentUrl(input.incidentUrl)).hostname;
  const metrics = computeMetricsProxy({
    severity: input.severity,
    relatedCount: Math.max(0, allUrls.length - 1),
    freshnessHintMinutes: 30,
  });
  return {
    workspace_id: input.workspaceId,
    domain,
    workspace_name: input.workspaceName ?? "AHackaday",
    timezone: input.timezone ?? "UTC",
    incident: {
      incident_key: input.incidentKey,
      incident_url: normalizeIncidentUrl(input.incidentUrl),
      incident_title: input.incidentTitle,
      severity: input.severity,
    },
    url_buckets: {
      primary: allUrls.slice(0, 1),
      related: allUrls.slice(1),
      selected_count: allUrls.length,
    },
    topic_cluster: getTopicCluster(input.incidentTitle, input.tags ?? []),
    location_tag: "global",
    metrics_proxy: metrics,
    bridge_meta: {
      origin: "ahackaday",
      incident_key: input.incidentKey,
      selected_count: allUrls.length,
      mapping_summary: `${allUrls.length} urls mapped`,
      source: "ops_pack",
    },
  };
}

export async function fetchIncidentState(input: {
  incidentKey: string;
  workspaceId: string;
  requestId?: string;
}): Promise<GraceIncidentState> {
  const correlation = getCorrelationIds({
    requestId: input.requestId,
    incidentKey: input.incidentKey,
    workspaceId: input.workspaceId,
  });
  try {
    const report = await graceFetch<unknown>(
      `/api/grace-report?workspace_id=${encodeURIComponent(input.workspaceId)}&incident_key=${encodeURIComponent(input.incidentKey)}`,
      { method: "GET" },
      correlation,
    );
    const state = toCompactIncidentState({ incidentKey: input.incidentKey, report, stale: false });
    incidentStateCache.set(input.incidentKey, { state, cachedAt: Date.now() });
    return state;
  } catch (error) {
    const cached = incidentStateCache.get(input.incidentKey);
    if (cached && Date.now() - cached.cachedAt < INCIDENT_STATE_CACHE_TTL_MS) {
      return { ...cached.state, stale: true };
    }
    throw error;
  }
}

export async function runIncident(input: {
  incidentKey: string;
  incidentUrl: string;
  incidentTitle: string;
  severity: Severity;
  relatedUrls?: string[];
  tags?: string[];
  tenantId?: string;
  requestId?: string;
}): Promise<{ run_id: string; status: RunStatus }> {
  const workspaceId = await resolveGraceWorkspaceId(input.tenantId);
  const correlation = getCorrelationIds({
    requestId: input.requestId,
    incidentKey: input.incidentKey,
    workspaceId,
  });
  const payload = buildGraceWeeklyPayload({
    incidentKey: input.incidentKey,
    incidentUrl: input.incidentUrl,
    incidentTitle: input.incidentTitle,
    severity: input.severity,
    relatedUrls: input.relatedUrls,
    tags: input.tags,
    workspaceId,
  });

  const response = await graceFetch<{ run_id?: string; id?: string; status?: string }>(
    "/api/grace-weekly",
    { method: "POST", body: JSON.stringify(payload) },
    correlation,
  );
  return {
    run_id: String(response.run_id ?? response.id ?? ""),
    status: normalizeRunStatus(response.status),
  };
}

export async function forwardRecommendationAction(input: {
  recommendationId: string;
  nextStatus: string;
  actor: string;
  incidentKey: string;
  tenantId?: string;
  requestId?: string;
}) {
  const workspaceId = await resolveGraceWorkspaceId(input.tenantId);
  const correlation = getCorrelationIds({
    requestId: input.requestId,
    incidentKey: input.incidentKey,
    workspaceId,
  });
  await graceFetch(
    "/api/grace-approvals",
    {
      method: "POST",
      body: JSON.stringify({
        recommendation_id: input.recommendationId,
        next_status: input.nextStatus,
        actor: input.actor,
        workspace_id: workspaceId,
        bridge_meta: {
          origin: "ahackaday",
          source: "ops_pack",
          incident_key: input.incidentKey,
        },
      }),
    },
    correlation,
  );
  return fetchIncidentState({
    incidentKey: input.incidentKey,
    workspaceId,
    requestId: correlation.request_id,
  });
}

export function parsePollingParams(url: URL): { intervalMs: number; timeoutMs: number } {
  const interval = Math.min(15000, Math.max(1500, Number(url.searchParams.get("poll_interval_ms") ?? "3000")));
  const timeout = Math.min(90000, Math.max(5000, Number(url.searchParams.get("poll_timeout_ms") ?? "30000")));
  return { intervalMs: interval, timeoutMs: timeout };
}

export function isIncidentStateStaleByAge(isoTime: string): boolean {
  const ts = new Date(isoTime).getTime();
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > INCIDENT_STATE_STALE_MS;
}
