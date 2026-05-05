import { NextResponse } from "next/server";

import { fetchDailyAeoDigest, isOpsPackGraceEnabled, isOpsPackGraceRollbackEnabled } from "@/lib/grace-ops";
import { getAllIncidents } from "@/lib/incidents";
import { buildDailyAeoDigest } from "@/lib/ops-weekly-aeo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isOpsPackGraceEnabled() || isOpsPackGraceRollbackEnabled()) {
    return NextResponse.json({ ok: false, error: "Grace Ops disabled by feature flag" }, { status: 404 });
  }

  try {
    const graceBrief = await fetchDailyAeoDigest();
    if (
      graceBrief.topics.length > 0
      && graceBrief.opportunities.length > 0
      && graceBrief.recommendations.length > 0
      && graceBrief.feedback.length > 0
    ) {
      return NextResponse.json({ ok: true, brief: graceBrief, source: "grace" });
    }
  } catch {
    // Grace strategy falls back to local derivation below.
  }

  try {
    const incidents = await getAllIncidents();
    const brief = buildDailyAeoDigest({ incidents });
    return NextResponse.json({ ok: true, brief, source: "local_fallback" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to build daily digest" },
      { status: 500 },
    );
  }
}
