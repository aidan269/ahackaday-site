import { createClient } from "@supabase/supabase-js";

import { withTimeout } from "@/lib/promise-timeout";

const SUPABASE_QUERY_MS = 10_000;

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
  const voteQuery = Promise.resolve(
    supabase.from("user_incident_votes").select("incident_slug,vote").in("incident_slug", slugs),
  );
  const { data, error } = await withTimeout(
    voteQuery,
    SUPABASE_QUERY_MS,
    { data: null, error: { message: "timeout" } } as unknown as Awaited<typeof voteQuery>,
  );
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

export async function getIncidentSaveCountMap(slugs: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (slugs.length === 0) return out;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return out;

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const savedQuery = Promise.resolve(
    supabase.from("user_saved_incidents").select("incident_slug").in("incident_slug", slugs),
  );
  const { data, error } = await withTimeout(
    savedQuery,
    SUPABASE_QUERY_MS,
    { data: null, error: { message: "timeout" } } as unknown as Awaited<typeof savedQuery>,
  );
  if (error || !data) return out;

  for (const row of data as Array<{ incident_slug: string }>) {
    if (typeof row.incident_slug !== "string") continue;
    out.set(row.incident_slug, (out.get(row.incident_slug) ?? 0) + 1);
  }
  return out;
}

export async function getIncidentCommentCountMap(slugs: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (slugs.length === 0) return out;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return out;

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const commentQuery = Promise.resolve(
    supabase.from("incident_comments").select("incident_slug").in("incident_slug", slugs),
  );
  const { data, error } = await withTimeout(
    commentQuery,
    SUPABASE_QUERY_MS,
    { data: null, error: { message: "timeout" } } as unknown as Awaited<typeof commentQuery>,
  );
  if (error || !data) return out;

  for (const row of data as Array<{ incident_slug: string }>) {
    if (typeof row.incident_slug !== "string") continue;
    out.set(row.incident_slug, (out.get(row.incident_slug) ?? 0) + 1);
  }
  return out;
}
