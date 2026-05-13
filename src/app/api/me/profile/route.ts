import { NextResponse } from "next/server";

import { getAuthedUserIdFromRequest } from "@/lib/supabase-auth-request";
import {
  getSupabaseAdminClient,
  isValidHandle,
  normalizeHandle,
  profileFromRow,
} from "@/lib/messaging";

type ProfileRow = {
  user_id: string;
  handle: string;
  display_name: string | null;
};

export async function GET(request: Request) {
  const userId = await getAuthedUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });

  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,handle,display_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    profile: data ? profileFromRow(data as ProfileRow) : null,
  });
}

export async function PATCH(request: Request) {
  const userId = await getAuthedUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { handle?: string; displayName?: string | null }
    | null;
  const handle = normalizeHandle(body?.handle ?? "");
  const displayName = body?.displayName?.trim() || null;
  if (!isValidHandle(handle)) {
    return NextResponse.json(
      { ok: false, error: "Handle must be 3-30 lowercase letters, numbers, underscores, or hyphens." },
      { status: 400 },
    );
  }
  if (displayName && displayName.length > 80) {
    return NextResponse.json({ ok: false, error: "Display name must be 80 characters or fewer." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase env not configured." }, { status: 500 });

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: userId,
        handle,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("user_id,handle,display_name")
    .single();
  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message = error.code === "23505" ? "That handle is already taken." : error.message;
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  return NextResponse.json({ ok: true, profile: profileFromRow(data as ProfileRow) });
}
