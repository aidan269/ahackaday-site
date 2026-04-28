import { incidentCanonicalUrl } from "@/lib/ecosystem";
import {
  filterIncidents,
  getAllIncidents,
  getIncidentBySlug,
  type IncidentType,
  type Severity,
} from "@/lib/incidents";
import type { Incident } from "@/lib/incident-types";
import { deriveRateLimitKey, takeRateLimit } from "@/lib/rate-limit";

const API_VERSION = "v1";
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

const API_RATE_LIMIT_MAX = 60;
const API_RATE_LIMIT_WINDOW_MS = 60_000;

export type ApiIncident = {
  slug: string;
  title: string;
  summary: string;
  severity: Severity;
  category: string;
  date: string;
  exploited: boolean;
  mitigationStatus: string;
  sources: string[];
  canonical_url: string;
  socialMentions24h?: number;
  socialTrend?: "up" | "flat" | "down";
  socialSummary?: string;
};

export type ApiIncidentDetail = ApiIncident & {
  affected: string;
  cve?: string;
  tldr: string;
  realWorldImpact: string;
  whyCare: string;
  actionItems: string[];
  iocs: string[];
  ambiguities: string[];
  confidenceScore: number;
};

type CursorPayload = {
  date: string;
  slug: string;
};

type IncidentsQuery = {
  severity: Severity | "all";
  category: IncidentType | "all";
  window: "7d" | "30d" | "90d" | "all";
  q: string;
  limit: number;
  cursor?: string;
};

function toApiIncident(incident: Incident): ApiIncident {
  return {
    slug: incident.slug,
    title: incident.title,
    summary: incident.summary,
    severity: incident.severity,
    category: incident.category,
    date: incident.date,
    exploited: incident.exploited,
    mitigationStatus: incident.mitigationStatus,
    sources: incident.sources,
    canonical_url: incidentCanonicalUrl(incident.slug),
    socialMentions24h: incident.socialMentions24h,
    socialTrend: incident.socialTrend,
    socialSummary: incident.socialSummary,
  };
}

function toApiIncidentDetail(
  incident: NonNullable<Awaited<ReturnType<typeof getIncidentBySlug>>>,
): ApiIncidentDetail {
  return {
    ...toApiIncident(incident),
    affected: incident.affected,
    cve: incident.cve,
    tldr: incident.tldr,
    realWorldImpact: incident.realWorldImpact,
    whyCare: incident.whyCare,
    actionItems: incident.actionItems,
    iocs: incident.iocs,
    ambiguities: incident.ambiguities,
    confidenceScore: incident.confidenceScore,
  };
}

function isSeverity(value: string): value is Severity {
  return value === "critical" || value === "high" || value === "medium" || value === "low";
}

function isIncidentType(value: string): value is IncidentType {
  return (
    value === "all"
    || value === "zero-day"
    || value === "supply-chain"
    || value === "breach"
    || value === "ransomware"
    || value === "identity"
    || value === "cloud"
    || value === "web"
    || value === "email"
    || value === "critical-infrastructure"
    || value === "exploitation"
    || value === "consumer-security"
    || value === "other"
  );
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const num = Number.parseInt(raw, 10);
  if (!Number.isFinite(num) || num <= 0) return DEFAULT_LIMIT;
  return Math.min(num, MAX_LIMIT);
}

function normalizeWindow(raw: string | null): "7d" | "30d" | "90d" | "all" {
  if (!raw || raw === "all") return "all";
  if (raw === "7" || raw === "7d") return "7d";
  if (raw === "30d") return "30d";
  if (raw === "90d") return "90d";
  return "all";
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Partial<CursorPayload>;
    if (!parsed || typeof parsed.date !== "string" || typeof parsed.slug !== "string") return null;
    return { date: parsed.date, slug: parsed.slug };
  } catch {
    return null;
  }
}

export function parseIncidentsQuery(url: URL): IncidentsQuery {
  const rawSeverity = (url.searchParams.get("severity") || "all").toLowerCase();
  const rawCategory = (url.searchParams.get("category") || "all").toLowerCase();
  const rawQ = (url.searchParams.get("q") || "").trim();
  const rawCursor = url.searchParams.get("cursor") || undefined;

  return {
    severity: isSeverity(rawSeverity) ? rawSeverity : "all",
    category: isIncidentType(rawCategory) ? rawCategory : "all",
    window: normalizeWindow(url.searchParams.get("window")),
    q: rawQ,
    limit: parseLimit(url.searchParams.get("limit")),
    cursor: rawCursor,
  };
}

export function makeApiHeaders(
  init?: { retryAfterSeconds?: number },
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  };
  if (init?.retryAfterSeconds) {
    headers["Retry-After"] = String(init.retryAfterSeconds);
  }
  return headers;
}

export function checkApiRateLimit(request: Request): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const key = `api-v1::${deriveRateLimitKey(request)}`;
  const quota = takeRateLimit(key, {
    max: API_RATE_LIMIT_MAX,
    windowMs: API_RATE_LIMIT_WINDOW_MS,
  });
  if (!quota.ok) {
    return { ok: false, retryAfterSeconds: quota.retryAfterSeconds };
  }
  return { ok: true };
}

export function getIncidentListFromData(
  incidents: Incident[],
  url: URL,
): (
  | { error: string; status: number }
  | {
    items: ApiIncident[];
    next_cursor: string | null;
    as_of: string;
    version: string;
  }
) {
  const query = parseIncidentsQuery(url);
  const filtered = filterIncidents(incidents, {
    severity: query.severity,
    type: query.category,
    window: query.window,
    query: query.q,
  });

  let start = 0;
  if (query.cursor) {
    const decoded = decodeCursor(query.cursor);
    if (!decoded) {
      return { error: "Invalid cursor", status: 400 };
    }
    const idx = filtered.findIndex((incident) => incident.slug === decoded.slug && incident.date === decoded.date);
    if (idx === -1) {
      return { error: "Cursor not found", status: 400 };
    }
    start = idx + 1;
  }

  const page = filtered.slice(start, start + query.limit);
  const tail = page.at(-1);
  const hasMore = start + query.limit < filtered.length;

  return {
    items: page.map(toApiIncident),
    next_cursor: hasMore && tail ? encodeCursor({ date: tail.date, slug: tail.slug }) : null,
    as_of: new Date().toISOString(),
    version: API_VERSION,
  };
}

export async function getIncidentListPayload(url: URL): Promise<
  | { error: string; status: number }
  | {
    items: ApiIncident[];
    next_cursor: string | null;
    as_of: string;
    version: string;
  }
> {
  const all = await getAllIncidents();
  return getIncidentListFromData(all, url);
}

export function getIncidentDetailFromData(
  incident: Incident | null,
): { error: string; status: number } | { item: ApiIncidentDetail; as_of: string; version: string } {
  if (!incident) {
    return { error: "Incident not found", status: 404 };
  }
  return {
    item: toApiIncidentDetail(incident),
    as_of: new Date().toISOString(),
    version: API_VERSION,
  };
}

export async function getIncidentDetailPayload(
  slug: string,
): Promise<{ error: string; status: number } | { item: ApiIncidentDetail; as_of: string; version: string }> {
  const incident = await getIncidentBySlug(slug);
  return getIncidentDetailFromData(incident);
}

export function getStatsFromData(incidents: Incident[]): {
  totals: {
    all: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    exploited: number;
  };
  latest_incident_date: string | null;
  as_of: string;
  version: string;
} {
  const latest = incidents.at(0)?.date ?? null;
  return {
    totals: {
      all: incidents.length,
      critical: incidents.filter((i) => i.severity === "critical").length,
      high: incidents.filter((i) => i.severity === "high").length,
      medium: incidents.filter((i) => i.severity === "medium").length,
      low: incidents.filter((i) => i.severity === "low").length,
      exploited: incidents.filter((i) => i.exploited).length,
    },
    latest_incident_date: latest,
    as_of: new Date().toISOString(),
    version: API_VERSION,
  };
}

export async function getStatsPayload(): Promise<{
  totals: {
    all: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    exploited: number;
  };
  latest_incident_date: string | null;
  as_of: string;
  version: string;
}> {
  const incidents = await getAllIncidents();
  return getStatsFromData(incidents);
}

export function getHealthFromData(
  incidents: Incident[],
  dataSource: string,
): {
  ok: true;
  data_source: string;
  incidents_count: number;
  latest_incident_date: string | null;
  as_of: string;
  version: string;
} {
  return {
    ok: true,
    data_source: dataSource,
    incidents_count: incidents.length,
    latest_incident_date: incidents.at(0)?.date ?? null,
    as_of: new Date().toISOString(),
    version: API_VERSION,
  };
}

export async function getHealthPayload(): Promise<{
  ok: true;
  data_source: string;
  incidents_count: number;
  latest_incident_date: string | null;
  as_of: string;
  version: string;
}> {
  const incidents = await getAllIncidents();
  const dataSource = process.env.DATA_SOURCE?.trim() || "markdown";
  return getHealthFromData(incidents, dataSource);
}
