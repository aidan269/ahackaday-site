import { NextResponse } from "next/server";

import {
  generateIncidentKey,
  isOpsPackGraceEnabled,
  isOpsPackGraceRollbackEnabled,
  runIncident,
} from "@/lib/grace-ops";
import type { Severity } from "@/lib/incident-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  incident_key?: string;
  incident_url?: string;
  incident_title?: string;
  severity?: Severity;
  related_urls?: string[];
  tags?: string[];
};

function isSeverity(value: string | undefined): value is Severity {
  return value === "critical" || value === "high" || value === "medium" || value === "low";
}

export async function POST(request: Request) {
  if (!isOpsPackGraceEnabled() || isOpsPackGraceRollbackEnabled()) {
    return NextResponse.json({ ok: false, error: "Grace Ops disabled by feature flag" }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as RequestBody | null;
  if (!body?.incident_url || !body?.incident_title || !isSeverity(body.severity)) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const incidentKey = body.incident_key?.trim()
    || generateIncidentKey({ incidentUrl: body.incident_url });

  const tenantId = request.headers.get("x-ah-tenant-id") ?? undefined;
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    const result = await runIncident({
      incidentKey,
      incidentUrl: body.incident_url,
      incidentTitle: body.incident_title,
      severity: body.severity,
      relatedUrls: body.related_urls,
      tags: body.tags,
      tenantId,
      requestId,
    });
    return NextResponse.json({
      ok: true,
      run_id: result.run_id,
      status: result.status,
      incident_key: incidentKey,
      polling: {
        status_values: ["queued", "started", "completed", "failed"],
        recommended_interval_ms: 3000,
        timeout_ms: 45000,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to run incident" },
      { status: 502 },
    );
  }
}
