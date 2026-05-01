import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getIncidentBySlug } from "@/lib/incidents";

type AuthUser = { id: string } | null;

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getAuthedUser(request: Request): Promise<AuthUser> {
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
  return { id: data.user.id };
}

function handleFromUserId(userId: string): string {
  return `user-${userId.slice(0, 8)}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) return NextResponse.json({ ok: false, error: "Incident not found." }, { status: 404 });

  const user = await getAuthedUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });

  const { data: comments, error: commentsError } = await supabase
    .from("incident_comments")
    .select("id,user_id,body,created_at")
    .eq("incident_slug", slug)
    .order("created_at", { ascending: false })
    .limit(100);
  if (commentsError) return NextResponse.json({ ok: false, error: commentsError.message }, { status: 500 });

  const commentIds = (comments ?? []).map((c) => c.id);
  const { data: votes, error: votesError } = await supabase
    .from("incident_comment_votes")
    .select("comment_id,user_id,vote")
    .in("comment_id", commentIds.length > 0 ? commentIds : ["00000000-0000-0000-0000-000000000000"]);
  if (votesError) return NextResponse.json({ ok: false, error: votesError.message }, { status: 500 });

  const voteMap = new Map<string, Array<{ user_id: string; vote: number }>>();
  for (const v of (votes ?? []) as Array<{ comment_id: string; user_id: string; vote: number }>) {
    const arr = voteMap.get(v.comment_id) ?? [];
    arr.push({ user_id: v.user_id, vote: v.vote });
    voteMap.set(v.comment_id, arr);
  }

  const out = (comments ?? []).map((c) => {
    const rows = voteMap.get(c.id) ?? [];
    const upvotes = rows.filter((r) => r.vote === 1).length;
    const downvotes = rows.filter((r) => r.vote === -1).length;
    const viewerVote = (rows.find((r) => r.user_id === user.id)?.vote ?? null) as -1 | 1 | null;
    return {
      id: c.id,
      body: c.body,
      created_at: c.created_at,
      author_handle: handleFromUserId(c.user_id),
      upvotes,
      downvotes,
      score: upvotes - downvotes,
      viewerVote,
      mine: c.user_id === user.id,
    };
  });

  return NextResponse.json({ ok: true, comments: out });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) return NextResponse.json({ ok: false, error: "Incident not found." }, { status: 404 });

  const user = await getAuthedUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { body?: string } | null;
  const text = body?.body?.trim() ?? "";
  if (text.length < 2) {
    return NextResponse.json({ ok: false, error: "Comment must be at least 2 characters." }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ ok: false, error: "Comment must be 2000 characters or fewer." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });

  const { data, error } = await supabase
    .from("incident_comments")
    .insert({
      incident_slug: slug,
      user_id: user.id,
      body: text,
    })
    .select("id,user_id,body,created_at")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "Insert failed." }, { status: 500 });

  return NextResponse.json({
    ok: true,
    comment: {
      id: data.id,
      body: data.body,
      created_at: data.created_at,
      author_handle: handleFromUserId(data.user_id),
      upvotes: 0,
      downvotes: 0,
      score: 0,
      viewerVote: null,
      mine: true,
    },
  });
}
