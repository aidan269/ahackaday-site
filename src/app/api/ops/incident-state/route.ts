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

const stateCoverage = {
  total: 0,
  withTopRecommendation: 0,
};

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
    stateCoverage.total += 1;
    if (state.top_recommendation) {
      stateCoverage.withTopRecommendation += 1;
    }
    if (stateCoverage.total % 20 === 0) {
      const pct = Number(
        ((stateCoverage.withTopRecommendation / Math.max(1, stateCoverage.total)) * 100).toFixed(2),
      );
      console.log(JSON.stringify({
        level: "info",
        event: "grace_incident_state_top_recommendation_coverage",
        sample_size: stateCoverage.total,
        with_top_recommendation: stateCoverage.withTopRecommendation,
        coverage_pct: pct,
      }));
    }

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
