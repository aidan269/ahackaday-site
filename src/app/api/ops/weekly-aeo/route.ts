import { NextResponse } from "next/server";

import { isOpsPackGraceEnabled, isOpsPackGraceRollbackEnabled } from "@/lib/grace-ops";
import { getAllIncidents } from "@/lib/incidents";
import { buildWeeklyAeoBrief } from "@/lib/ops-weekly-aeo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isOpsPackGraceEnabled() || isOpsPackGraceRollbackEnabled()) {
    return NextResponse.json({ ok: false, error: "Grace Ops disabled by feature flag" }, { status: 404 });
  }

  try {
    const incidents = await getAllIncidents();
    const brief = buildWeeklyAeoBrief({ incidents });
    return NextResponse.json({ ok: true, brief });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to build weekly brief" },
      { status: 500 },
    );
  }
}
