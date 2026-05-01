import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getIncidentBySlug } from "@/lib/incidents";

type VoteValue = -1 | 1;

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getAuthedUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const tokenMatch = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const token = tokenMatch?.[1]?.trim();
  if (!token) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return data.user.id;
}

async function getVoteSummary(slug: string, userId?: string | null) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("user_incident_votes")
    .select("vote,user_id")
    .eq("incident_slug", slug);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{ vote: number; user_id: string }>;
  const upvotes = rows.filter((r) => r.vote === 1).length;
  const downvotes = rows.filter((r) => r.vote === -1).length;
  const viewerVote = userId
    ? ((rows.find((r) => r.user_id === userId)?.vote ?? null) as VoteValue | null)
    : null;
  return NextResponse.json({
    ok: true,
    upvotes,
    downvotes,
    score: upvotes - downvotes,
    viewerVote,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) return NextResponse.json({ ok: false, error: "Incident not found." }, { status: 404 });
  const userId = await getAuthedUserId(request);
  return getVoteSummary(slug, userId);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) return NextResponse.json({ ok: false, error: "Incident not found." }, { status: 404 });

  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { vote?: number } | null;
  const vote = body?.vote;
  if (vote !== 1 && vote !== -1) {
    return NextResponse.json({ ok: false, error: "vote must be 1 or -1" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });
  }
  const { error } = await supabase.from("user_incident_votes").upsert(
    {
      user_id: userId,
      incident_slug: slug,
      vote,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,incident_slug" },
  );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return getVoteSummary(slug, userId);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) return NextResponse.json({ ok: false, error: "Incident not found." }, { status: 404 });

  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });
  }
  const { error } = await supabase
    .from("user_incident_votes")
    .delete()
    .eq("user_id", userId)
    .eq("incident_slug", slug);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return getVoteSummary(slug, userId);
}
