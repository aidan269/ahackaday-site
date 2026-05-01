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

async function ensureCommentBelongsToIncident(slug: string, commentId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("incident_comments")
    .select("id")
    .eq("id", commentId)
    .eq("incident_slug", slug)
    .maybeSingle();
  return !error && Boolean(data?.id);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; commentId: string }> },
) {
  const { slug, commentId } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) return NextResponse.json({ ok: false, error: "Incident not found." }, { status: 404 });

  const user = await getAuthedUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const ok = await ensureCommentBelongsToIncident(slug, commentId);
  if (!ok) return NextResponse.json({ ok: false, error: "Comment not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { vote?: number } | null;
  const vote = body?.vote;
  if (vote !== 1 && vote !== -1) {
    return NextResponse.json({ ok: false, error: "vote must be 1 or -1" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });

  const { error } = await supabase.from("incident_comment_votes").upsert(
    {
      comment_id: commentId,
      user_id: user.id,
      vote,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "comment_id,user_id" },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; commentId: string }> },
) {
  const { slug, commentId } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) return NextResponse.json({ ok: false, error: "Incident not found." }, { status: 404 });

  const user = await getAuthedUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const ok = await ensureCommentBelongsToIncident(slug, commentId);
  if (!ok) return NextResponse.json({ ok: false, error: "Comment not found." }, { status: 404 });

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });

  const { error } = await supabase
    .from("incident_comment_votes")
    .delete()
    .eq("comment_id", commentId)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
