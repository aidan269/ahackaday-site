import { createClient } from "@supabase/supabase-js";

export type AeoSubScores = {
  direct_answer: number;
  statistics: number;
  structure: number;
  authority: number;
  freshness: number;
  topical_depth: number;
};

export type AeoRecommendationInput = {
  issue: string;
  current_text: string;
  suggested_rewrite: string;
  why_it_helps: string;
};

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type LastScoreRow = {
  incident_id: string;
  content_hash: string;
  scored_at: string;
};

export async function lastScore(incidentId: string): Promise<LastScoreRow | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("aeo_scores")
    .select("incident_id, content_hash, scored_at")
    .eq("incident_id", incidentId)
    .maybeSingle();
  if (error || !data) return null;
  return data as LastScoreRow;
}

export async function touchScoredAt(incidentId: string): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;
  await supabase.from("aeo_scores").update({ scored_at: new Date().toISOString() }).eq("incident_id", incidentId);
}

export async function upsertScore(input: {
  incidentId: string;
  url: string;
  model: string;
  total_score: number;
  sub_scores: AeoSubScores;
  one_line_diagnosis: string;
  recommendations: AeoRecommendationInput[];
  low_content: boolean;
  content_hash: string;
  raw_response_id: string | null;
}): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) throw new Error("Supabase service client unavailable");

  const { error: upsertErr } = await supabase.from("aeo_scores").upsert(
    {
      incident_id: input.incidentId,
      url: input.url,
      model: input.model,
      total_score: input.total_score,
      sub_scores: input.sub_scores,
      one_line_diagnosis: input.one_line_diagnosis,
      low_content: input.low_content,
      content_hash: input.content_hash,
      raw_response_id: input.raw_response_id,
      scored_at: new Date().toISOString(),
    },
    { onConflict: "incident_id" },
  );
  if (upsertErr) throw upsertErr;

  await supabase.from("aeo_recommendations").delete().eq("incident_id", input.incidentId);

  const rows = (Array.isArray(input.recommendations) ? input.recommendations : []).map((r, i) => ({
    incident_id: input.incidentId,
    rank: i + 1,
    issue: r.issue,
    current_text: r.current_text,
    suggested_rewrite: r.suggested_rewrite,
    why_it_helps: r.why_it_helps,
  }));
  if (rows.length) {
    const { error: insErr } = await supabase.from("aeo_recommendations").insert(rows);
    if (insErr) throw insErr;
  }
}

export function classifyFailureKind(err: unknown): "timeout" | "rate_limit" | "schema" | "other" {
  const msg = String(err);
  if (/timeout|ETIMEDOUT|AbortError/i.test(msg)) return "timeout";
  if (/429|rate[_ ]limit/i.test(msg)) return "rate_limit";
  if (/schema|validation|tool_use/i.test(msg)) return "schema";
  return "other";
}

export async function recordFailure(input: {
  incidentId: string;
  url: string | null;
  attempt: number;
  err: unknown;
}): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;
  await supabase.from("aeo_score_failures").insert({
    incident_id: input.incidentId,
    url: input.url,
    attempt: input.attempt,
    error_kind: classifyFailureKind(input.err),
    error_detail: String(input.err).slice(0, 4000),
  });
}

export type ActiveCorpusRow = { id: string };

/** Pure skip rule: unchanged content hash and score newer than 7 days. */
export function shouldSkipAeoRescore(input: {
  lastContentHash: string | null;
  lastScoredAt: string | null;
  contentHash: string;
  nowMs?: number;
}): boolean {
  const now = input.nowMs ?? Date.now();
  if (!input.lastContentHash || !input.lastScoredAt) return false;
  if (input.lastContentHash !== input.contentHash) return false;
  const days = (now - new Date(input.lastScoredAt).getTime()) / 864e5;
  return days < 7;
}

export async function selectActiveCorpus(input: {
  windowDays: number;
  staleAfterHours: number;
}): Promise<ActiveCorpusRow[]> {
  const supabase = getServiceClient();
  if (!supabase) return [];

  const windowIso = new Date(Date.now() - input.windowDays * 864e5).toISOString();
  const staleIso = new Date(Date.now() - input.staleAfterHours * 3600e3).toISOString();

  const { data: recent, error: e1 } = await supabase
    .from("incidents")
    .select("id")
    .gte("published_at", windowIso);
  if (e1 || !recent?.length) return [];

  const ids = recent.map((r) => r.id as string);
  const { data: scores } = await supabase.from("aeo_scores").select("incident_id, scored_at").in("incident_id", ids);

  const scoreMap = new Map((scores ?? []).map((s) => [s.incident_id as string, s.scored_at as string]));

  return ids
    .filter((id) => {
      const scoredAt = scoreMap.get(id);
      if (!scoredAt) return true;
      return scoredAt < staleIso;
    })
    .map((id) => ({ id }));
}
