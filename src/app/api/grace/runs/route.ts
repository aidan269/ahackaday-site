import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { runGracePlugins, type GracePluginContext } from "@/lib/grace-plugins";
import { getAuthedUserIdFromRequest } from "@/lib/supabase-auth-request";

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Track = "contain" | "hunt" | "patch" | "brief";

export async function POST(request: Request) {
  const userId = await getAuthedUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Partial<GracePluginContext & { track?: Track }> | null;
  const track = body?.track;
  const canonicalId = body?.canonicalId;
  const slug = body?.incidentSlug;
  const trackInvalid =
    track !== "contain" && track !== "hunt" && track !== "patch" && track !== "brief";
  if (
    !canonicalId ||
    typeof canonicalId !== "string" ||
    !slug ||
    typeof slug !== "string" ||
    trackInvalid
  ) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });
  }

  const { data: canonicalRow, error: canonErr } = await supabase
    .from("incidents")
    .select("canonical_id")
    .eq("canonical_id", canonicalId)
    .maybeSingle();
  if (canonErr || !canonicalRow) {
    return NextResponse.json({ ok: false, error: "Unknown canonical incident" }, { status: 404 });
  }

  const ctx: GracePluginContext = {
    incidentSlug: slug,
    canonicalId,
    track,
    title: typeof body.title === "string" ? body.title : slug,
    severity: typeof body.severity === "string" ? body.severity : "medium",
    summary: typeof body.summary === "string" ? body.summary : "",
    sources: Array.isArray(body.sources) ? (body.sources as string[]) : [],
    iocs: Array.isArray(body.iocs) ? (body.iocs as string[]) : [],
    evidence:
      body.evidence && typeof body.evidence === "object"
        ? {
            cves: Array.isArray((body.evidence as { cves?: string[] }).cves)
              ? ((body.evidence as { cves: string[] }).cves)
              : [],
            packages: Array.isArray((body.evidence as { packages?: string[] }).packages)
              ? ((body.evidence as { packages: string[] }).packages)
              : [],
          }
        : { cves: [], packages: [] },
  };

  const pluginResults = await runGracePlugins(ctx);
  const startedAt = new Date().toISOString();

  const { data: inserted, error: insertErr } = await supabase
    .from("grace_runs")
    .insert({
      incident_canonical_id: canonicalId,
      incident_slug: slug,
      track,
      status: "completed",
      inputs: {
        ...ctx,
        requestedBy: userId,
      },
      outputs: {
        plugins: pluginResults,
      },
      audit: {
        plugins: pluginResults,
        requestedAt: startedAt,
      },
      plugins_used: pluginResults.map((p) => p.name),
      tokens_used: null,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      actor: `user:${userId}`,
    })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    runId: inserted?.id ?? null,
    plugins: pluginResults,
  });
}
