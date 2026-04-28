import { createClient } from "@supabase/supabase-js";

import { buildIncidentSlug, inferExploitedSignal, type Severity } from "@/lib/incidents";

type IncidentRow = {
  id: string;
  title: string;
  claude_summary: string;
  severity: Severity;
  published_at: string;
};

type ExistingSocialMetric = {
  incident_id: string;
  social_mentions_24h: number | null;
};

type GithubSearchResponse = {
  total_count: number;
  items?: Array<{ title?: string; body?: string }>;
};

const STOPWORDS = new Set([
  "with", "from", "that", "this", "have", "after", "under", "into", "about", "while",
  "incident", "security", "attack", "attacks", "vulnerability", "vulnerabilities",
]);

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function authIsValid(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  return Boolean(expected && authHeader === `Bearer ${expected}`);
}

function buildGithubQuery(incident: IncidentRow): string {
  const cveMatch = /CVE-\d{4}-\d+/i.exec(`${incident.title} ${incident.claude_summary}`)?.[0];
  const titleTokens = incident.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 4);
  const focus = cveMatch ? `"${cveMatch}"` : titleTokens.map((token) => `"${token}"`).join(" ");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `${focus} created:>=${since}`;
}

function toTrend(currentMentions: number, previousMentions: number | null): "up" | "flat" | "down" {
  if (previousMentions === null || previousMentions <= 0) return "flat";
  const delta = ((currentMentions - previousMentions) / previousMentions) * 100;
  if (delta >= 8) return "up";
  if (delta <= -8) return "down";
  return "flat";
}

function toPlatformSplit(mentions: number): { x: number; reddit: number; github: number } {
  const github = Math.max(18, Math.min(72, 18 + Math.floor(mentions / 25)));
  const x = Math.max(12, Math.floor((100 - github) * 0.58));
  const reddit = Math.max(8, 100 - github - x);
  return { x, reddit, github };
}

function extractKeywords(incident: IncidentRow, githubItems: GithubSearchResponse["items"]): string[] {
  const cve = /CVE-\d{4}-\d+/i.exec(`${incident.title} ${incident.claude_summary}`)?.[0]?.toLowerCase();
  const bucket = new Map<string, number>();
  const raw = `${incident.title} ${githubItems?.map((item) => `${item.title ?? ""} ${item.body ?? ""}`).join(" ")}`;
  for (const token of raw.toLowerCase().replace(/[^a-z0-9-\s]/g, " ").split(/\s+/)) {
    if (token.length < 4 || STOPWORDS.has(token)) continue;
    bucket.set(token, (bucket.get(token) ?? 0) + 1);
  }
  const keywords = [...bucket.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([token]) => `#${token}`);
  if (cve && !keywords.includes(`#${cve}`)) keywords.unshift(`#${cve}`);
  return keywords.slice(0, 4);
}

async function fetchGithubMentions(incident: IncidentRow): Promise<{ mentions: number; keywords: string[] }> {
  const query = buildGithubQuery(incident);
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "AHackaday-SocialRefresh/1.0",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=25`, {
    headers,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`GitHub search failed (${response.status})`);
  }
  const data = await response.json() as GithubSearchResponse;
  return {
    mentions: Math.max(0, Math.min(5000, data.total_count ?? 0)),
    keywords: extractKeywords(incident, data.items),
  };
}

export async function refreshIncidentSocialMetrics(limit = 60): Promise<{
  ok: true;
  scanned: number;
  updated: number;
  errors: string[];
}> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin credentials not configured.");

  const { data: incidents, error: incidentsError } = await supabase
    .from("incidents")
    .select("id,title,claude_summary,severity,published_at")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (incidentsError || !incidents) {
    throw new Error(`Failed loading incidents: ${incidentsError?.message ?? "unknown"}`);
  }
  const rows = incidents as IncidentRow[];
  const ids = rows.map((row) => row.id);
  const { data: existingRows } = await supabase
    .from("incident_social_metrics")
    .select("incident_id,social_mentions_24h")
    .in("incident_id", ids);
  const previous = new Map<string, ExistingSocialMetric>();
  for (const row of (existingRows as ExistingSocialMetric[] | null) ?? []) previous.set(row.incident_id, row);

  let updated = 0;
  const errors: string[] = [];
  for (const incident of rows) {
    try {
      const { mentions, keywords } = await fetchGithubMentions(incident);
      const prevMentions = previous.get(incident.id)?.social_mentions_24h ?? null;
      const deltaPct = prevMentions && prevMentions > 0
        ? Math.round(((mentions - prevMentions) / prevMentions) * 100)
        : null;
      const trend = toTrend(mentions, prevMentions);
      const split = toPlatformSplit(mentions);
      const exploited = inferExploitedSignal(`${incident.title} ${incident.claude_summary}`);
      const slug = buildIncidentSlug(incident.published_at, incident.title, incident.id);
      const summary = exploited || trend === "up"
        ? "Live chatter is accelerating; analysts are actively validating impact."
        : trend === "down"
          ? "Discussion volume is cooling as mitigation guidance propagates."
          : "Discussion is stable with periodic checks on scope and remediation.";

      const { error } = await supabase.from("incident_social_metrics").upsert({
        incident_id: incident.id,
        social_mentions_24h: mentions,
        social_trend: trend,
        social_summary: summary,
        social_delta_24h_pct: deltaPct,
        social_platform_split: split,
        social_keywords: keywords,
        source: "github",
        updated_at: new Date().toISOString(),
      }, { onConflict: "incident_id" });

      if (error) {
        errors.push(`${slug}: ${error.message}`);
      } else {
        updated += 1;
      }
    } catch (error) {
      errors.push(`${incident.title}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: true, scanned: rows.length, updated, errors };
}

export function assertSocialRefreshAuthorized(request: Request): Response | null {
  if (authIsValid(request)) return null;
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}
