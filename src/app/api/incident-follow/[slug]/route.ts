import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getIncidentBySlug } from "@/lib/incidents";
import { getAuthedUserIdFromRequest } from "@/lib/supabase-auth-request";

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) return NextResponse.json({ ok: false, error: "Incident not found" }, { status: 404 });

  const userId = await getAuthedUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ ok: true, following: false, mentionAlertThreshold: null });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("user_incident_follows")
    .select("mention_alert_threshold")
    .eq("user_id", userId)
    .eq("incident_slug", slug)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    following: Boolean(data),
    mentionAlertThreshold:
      data && typeof data === "object" && "mention_alert_threshold" in data
        ? (data as { mention_alert_threshold: number | null }).mention_alert_threshold
        : null,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) return NextResponse.json({ ok: false, error: "Incident not found" }, { status: 404 });

  const userId = await getAuthedUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | {
        follow?: boolean;
        mentionAlertThreshold?: number | null;
      }
    | null;
  const follow = body?.follow;
  if (typeof follow !== "boolean") {
    return NextResponse.json({ ok: false, error: "follow boolean required" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });
  }

  if (!follow) {
    const { error } = await supabase.from("user_incident_follows").delete().eq("user_id", userId).eq("incident_slug", slug);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, following: false });
  }

  const threshold =
    body?.mentionAlertThreshold === null || body?.mentionAlertThreshold === undefined
      ? null
      : Number(body.mentionAlertThreshold);
  if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0)) {
    return NextResponse.json({ ok: false, error: "invalid threshold" }, { status: 400 });
  }

  const { error } = await supabase.from("user_incident_follows").upsert(
    {
      user_id: userId,
      incident_slug: slug,
      mention_alert_threshold: threshold,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,incident_slug" },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, following: true, mentionAlertThreshold: threshold });
}
