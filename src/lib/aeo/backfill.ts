import type { SupabaseClient } from "@supabase/supabase-js";

/** Newest-published incidents first among those missing `aeo_scores`. */
export function takeMissingFromRecentOrder(orderedIds: string[], have: Set<string>, take: number): string[] {
  const out: string[] = [];
  for (const id of orderedIds) {
    if (!have.has(id)) out.push(id);
    if (out.length >= take) break;
  }
  return out;
}

/**
 * Incident UUIDs in `public.incidents` with no row in `public.aeo_scores`.
 * Ordered by `published_at` descending so backfills and `--limit` prioritize fresh stories.
 */
export async function listIncidentIdsMissingAeoScores(supabase: SupabaseClient): Promise<string[]> {
  const [{ data: incidents, error: e1 }, { data: scored, error: e2 }] = await Promise.all([
    supabase.from("incidents").select("id, published_at").order("published_at", { ascending: false }),
    supabase.from("aeo_scores").select("incident_id"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const have = new Set((scored ?? []).map((r) => r.incident_id as string));
  return (incidents ?? []).map((r) => r.id as string).filter((id) => !have.has(id));
}

/**
 * Up to `take` incident ids missing scores, scanning only the `scanCap` most recently published rows
 * (avoids loading the full incidents table when you only care about the latest backlog).
 */
export async function listRecentIncidentIdsMissingAeoScores(
  supabase: SupabaseClient,
  take: number,
  scanCap = Math.min(800, Math.max(take * 25, 100)),
): Promise<string[]> {
  const { data: scored, error: e2 } = await supabase.from("aeo_scores").select("incident_id");
  if (e2) throw e2;
  const have = new Set((scored ?? []).map((r) => r.incident_id as string));

  const { data: rows, error: e1 } = await supabase
    .from("incidents")
    .select("id")
    .order("published_at", { ascending: false })
    .limit(scanCap);
  if (e1) throw e1;

  const ids = (rows ?? []).map((r) => r.id as string);
  return takeMissingFromRecentOrder(ids, have, take);
}

/** Most recently published incidents (by `published_at`), regardless of AEO row. */
export async function listRecentIncidentIdsByPublished(supabase: SupabaseClient, take: number): Promise<string[]> {
  const { data: rows, error } = await supabase
    .from("incidents")
    .select("id")
    .order("published_at", { ascending: false })
    .limit(take);
  if (error) throw error;
  return (rows ?? []).map((r) => r.id as string);
}
