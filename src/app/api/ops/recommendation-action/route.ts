import { NextResponse } from "next/server";

import {
  forwardRecommendationAction,
  isOpsPackGraceEnabled,
  isOpsPackGraceRollbackEnabled,
} from "@/lib/grace-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  recommendation_id?: string;
  next_status?: string;
  actor?: string;
  incident_key?: string;
};

export async function POST(request: Request) {
  if (!isOpsPackGraceEnabled() || isOpsPackGraceRollbackEnabled()) {
    return NextResponse.json({ ok: false, error: "Grace Ops disabled by feature flag" }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as RequestBody | null;
  if (!body?.recommendation_id || !body?.next_status || !body?.actor || !body?.incident_key) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const tenantId = request.headers.get("x-ah-tenant-id") ?? undefined;
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const state = await forwardRecommendationAction({
      recommendationId: body.recommendation_id,
      nextStatus: body.next_status,
      actor: body.actor,
      incidentKey: body.incident_key,
      tenantId,
      requestId,
    });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to forward recommendation action" },
      { status: 502 },
    );
  }
}
