import { createClient } from "@supabase/supabase-js";

import type { ContentData, TopicQueueItem } from "@/components/grace-ops/types";
import type { Incident } from "@/lib/incident-types";
import { deriveVulnLabel } from "@/lib/incident-vuln";
import { getIncidentBySlug } from "@/lib/incidents";
import { isAeoAdminUserId } from "@/lib/aeo/admin";

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function topicMatchesIncident(topic: TopicQueueItem, needles: string[]): boolean {
  const hay = `${topic.target_query} ${topic.brand_angle}`.toLowerCase();
  return needles.some((n) => n && hay.includes(n.toLowerCase()));
}

/**
 * Loads AEO score + recommendations + digest-suggested topics for the Content tab.
 * Returns null when the incident has not been scored yet.
 */
export async function fetchContentData(slug: string, viewerUserId: string | null): Promise<ContentData | null> {
  const incident = await getIncidentBySlug(slug);
  if (!incident?.sourceRowIds?.[0]) return null;
  const incidentUuid = incident.sourceRowIds[0];
  const supabase = getServiceClient();
  if (!supabase) return null;

  const { data: scoreRow, error: scoreErr } = await supabase
    .from("aeo_scores")
    .select("incident_id, scored_at, model, total_score, sub_scores, one_line_diagnosis, low_content")
    .eq("incident_id", incidentUuid)
    .maybeSingle();
  if (scoreErr || !scoreRow) return null;

  const { data: recRows } = await supabase
    .from("aeo_recommendations")
    .select("id, rank, issue, current_text, suggested_rewrite, why_it_helps, dismissed")
    .eq("incident_id", incidentUuid)
    .order("rank", { ascending: true });

  const { data: digestRow } = await supabase
    .from("aeo_digests")
    .select("topic_queue, week_start")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const topicQueue = (digestRow?.topic_queue as TopicQueueItem[] | null) ?? [];
  const vuln = deriveVulnLabel({
    title: incident.title,
    evidence: incident.evidence,
    cve: incident.cve,
  });
  const needles = [
    vuln,
    incident.evidence.cves[0],
    incident.category,
    ...incident.evidence.packages.slice(0, 2),
  ].filter(Boolean) as string[];

  const topics = topicQueue.filter((t) => topicMatchesIncident(t, needles)).slice(0, 4);

  const sub = scoreRow.sub_scores as ContentData["sub_scores"];

  return {
    incidentUuid,
    scored_at: scoreRow.scored_at as string,
    model: scoreRow.model as string,
    total_score: Number(scoreRow.total_score),
    sub_scores: sub,
    one_line_diagnosis: scoreRow.one_line_diagnosis as string,
    low_content: Boolean(scoreRow.low_content),
    recommendations: (recRows ?? [])
      .filter((r) => !r.dismissed)
      .map((r) => ({
        id: r.id as number,
        rank: r.rank as number,
        issue: r.issue as string,
        current_text: r.current_text as string,
        suggested_rewrite: r.suggested_rewrite as string,
        why_it_helps: r.why_it_helps as string,
        dismissed: Boolean(r.dismissed),
      })),
    topics,
    isAdminViewer: isAeoAdminUserId(viewerUserId),
  };
}

/** @deprecated Use fetchContentData; triage data is assembled client-side in TriageTab. */
export async function fetchTriageData(_slug: string): Promise<{ updated_at: string | null }> {
  return { updated_at: null };
}

/** Batch-load `total_score` from `aeo_scores` for feed cards (UUID-keyed incidents). */
export async function fetchAeoScoresByIncidentIds(ids: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const supabase = getServiceClient();
  if (!supabase) return new Map();

  const { data, error } = await supabase.from("aeo_scores").select("incident_id, total_score").in("incident_id", unique);
  if (error || !data) return new Map();

  const m = new Map<string, number>();
  for (const row of data) {
    const id = row.incident_id as string;
    m.set(id, Number(row.total_score));
  }
  return m;
}

/** Attach `aeoScore` to incidents that map to Supabase row ids (markdown-only rows get `null`). */
export async function attachFeedAeoScores(incidents: Incident[]): Promise<Incident[]> {
  const ids = incidents.map((i) => i.sourceRowIds?.[0]).filter((id): id is string => Boolean(id));
  const scores = await fetchAeoScoresByIncidentIds(ids);
  return incidents.map((inc) => {
    const uuid = inc.sourceRowIds?.[0];
    if (!uuid) return { ...inc, aeoScore: null };
    const n = scores.get(uuid);
    return { ...inc, aeoScore: n ?? null };
  });
}
