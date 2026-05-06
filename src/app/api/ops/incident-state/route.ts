import { NextResponse } from "next/server";

import {
  fetchIncidentState,
  isOpsPackGraceEnabled,
  isOpsPackGraceParallelValidateEnabled,
  isOpsPackGraceRollbackEnabled,
  resolveGraceWorkspaceId,
} from "@/lib/grace-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isOpsPackGraceEnabled() || isOpsPackGraceRollbackEnabled()) {
    return NextResponse.json({ ok: false, error: "Grace Ops disabled by feature flag" }, { status: 404 });
  }

  const url = new URL(request.url);
  const incidentKey = url.searchParams.get("incident_key")?.trim();
  if (!incidentKey) {
    return NextResponse.json({ ok: false, error: "incident_key is required" }, { status: 400 });
  }

  const tenantId = request.headers.get("x-ah-tenant-id") ?? undefined;
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const workspaceId = await resolveGraceWorkspaceId(tenantId);
    const state = await fetchIncidentState({
      incidentKey,
      workspaceId,
      requestId,
    });

    if (isOpsPackGraceParallelValidateEnabled()) {
      console.log(JSON.stringify({
        level: "info",
        event: "ops_pack_parallel_compare",
        request_id: requestId ?? null,
        incident_key: incidentKey,
        workspace_id: workspaceId,
        grace_kpis: state.kpis,
        grace_top_recommendation: state.top_recommendation,
        grace_counts: state.recommendation_counts_by_status,
        grace_freshness: state.latest_run?.created_at ?? null,
      }));
    }

    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch incident state" },
      { status: 502 },
    );
  }
}
