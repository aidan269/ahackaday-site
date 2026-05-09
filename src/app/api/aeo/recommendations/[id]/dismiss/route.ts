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

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authErr = await assertAeoAdmin(req);
  if (authErr) return authErr;

  const { id } = await ctx.params;
  const rid = Number.parseInt(id, 10);
  if (!Number.isFinite(rid)) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const { error } = await supabase
    .from("aeo_recommendations")
    .update({ dismissed: true, dismissed_at: new Date().toISOString() })
    .eq("id", rid);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
