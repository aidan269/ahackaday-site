import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { assertAeoAdmin } from "@/lib/aeo/admin";

export const runtime = "nodejs";

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: Request) {
  const authErr = await assertAeoAdmin(req);
  if (authErr) return authErr;

  const url = new URL(req.url);
  const weekStart = url.searchParams.get("week_start")?.trim();
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ ok: false, error: "week_start=YYYY-MM-DD required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const { data, error } = await supabase.from("aeo_digests").select("*").eq("week_start", weekStart).maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, digest: data });
}
