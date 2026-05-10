import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Incident UUIDs in `public.incidents` with no row in `public.aeo_scores`.
 */
export async function listIncidentIdsMissingAeoScores(supabase: SupabaseClient): Promise<string[]> {
  const [{ data: incidents, error: e1 }, { data: scored, error: e2 }] = await Promise.all([
    supabase.from("incidents").select("id"),
    supabase.from("aeo_scores").select("incident_id"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const have = new Set((scored ?? []).map((r) => r.incident_id as string));
  return (incidents ?? []).map((r) => r.id as string).filter((id) => !have.has(id));
}
