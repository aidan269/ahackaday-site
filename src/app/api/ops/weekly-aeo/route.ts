import { NextResponse } from "next/server";

import { fetchDailyAeoDigest, isOpsPackGraceEnabled, isOpsPackGraceRollbackEnabled } from "@/lib/grace-ops";
import { getAllIncidents } from "@/lib/incidents";
import { buildDailyAeoDigest, mergeGraceAndLocalDigests } from "@/lib/ops-weekly-aeo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isOpsPackGraceEnabled() || isOpsPackGraceRollbackEnabled()) {
    return NextResponse.json({ ok: false, error: "Grace Ops disabled by feature flag" }, { status: 404 });
  }

  try {
    const incidents = await getAllIncidents();
    const localBrief = buildDailyAeoDigest({ incidents });

    let graceBrief = null;
    try {
      graceBrief = await fetchDailyAeoDigest();
    } catch {
      // Workspace digest is best-effort; local-strong path always returns a filled brief.
    }

    const merged = mergeGraceAndLocalDigests({ local: localBrief, grace: graceBrief });

    return NextResponse.json({
      ok: true,
      brief: merged.brief,
      source_mode: merged.source_mode,
      data_quality: merged.data_quality,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to build daily digest" },
      { status: 500 },
    );
  }
}
