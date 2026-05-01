import { createClient } from "@supabase/supabase-js";

export type IncidentVoteSummary = {
  upvotes: number;
  downvotes: number;
  score: number;
};

export async function getIncidentVoteSummaryMap(slugs: string[]): Promise<Map<string, IncidentVoteSummary>> {
  const out = new Map<string, IncidentVoteSummary>();
  if (slugs.length === 0) return out;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return out;

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase
    .from("user_incident_votes")
    .select("incident_slug,vote")
    .in("incident_slug", slugs);
  if (error || !data) return out;

  for (const row of data as Array<{ incident_slug: string; vote: number }>) {
    if (typeof row.incident_slug !== "string") continue;
    const current = out.get(row.incident_slug) ?? { upvotes: 0, downvotes: 0, score: 0 };
    if (row.vote === 1) current.upvotes += 1;
    if (row.vote === -1) current.downvotes += 1;
    current.score = current.upvotes - current.downvotes;
    out.set(row.incident_slug, current);
  }
  return out;
}
