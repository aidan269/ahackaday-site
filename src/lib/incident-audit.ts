import { createClient } from "@supabase/supabase-js";

import type { IncidentClaimRecord, IncidentRevisionRecord } from "@/lib/incident-types";
import { withTimeout } from "@/lib/promise-timeout";

const AUDIT_QUERY_TIMEOUT_MS = 10_000;

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function fetchIncidentClaimsAndRevisions(sourceRowIds: string[]): Promise<{
  claims: IncidentClaimRecord[];
  revisions: IncidentRevisionRecord[];
}> {
  const empty = { claims: [] as IncidentClaimRecord[], revisions: [] as IncidentRevisionRecord[] };
  if (sourceRowIds.length === 0) return empty;

  const supabase = getServiceClient();
  if (!supabase) return empty;

  const claimsQuery = Promise.resolve(
    supabase
      .from("incident_claims")
      .select("id,field,value,source_url,snippet,confidence,inferred_by,created_at")
      .in("incident_id", sourceRowIds)
      .order("created_at", { ascending: false })
      .limit(200),
  );
  const revisionsQuery = Promise.resolve(
    supabase
      .from("incident_revisions")
      .select("id,revision_no,changed_fields,previous_values,new_values,source,note,created_at")
      .in("incident_id", sourceRowIds)
      .order("created_at", { ascending: false })
      .limit(50),
  );

  let claimRows: unknown = null;
  let revRows: unknown = null;
  let claimErr: unknown = null;
  let revErr: unknown = null;

  try {
    const [claimsResult, revisionsResult] = await Promise.all([
      withTimeout(
        claimsQuery,
        AUDIT_QUERY_TIMEOUT_MS,
        { data: null, error: { message: "timeout" } } as unknown as Awaited<typeof claimsQuery>,
      ),
      withTimeout(
        revisionsQuery,
        AUDIT_QUERY_TIMEOUT_MS,
        { data: null, error: { message: "timeout" } } as unknown as Awaited<typeof revisionsQuery>,
      ),
    ]);
    claimRows = claimsResult.data;
    revRows = revisionsResult.data;
    claimErr = claimsResult.error;
    revErr = revisionsResult.error;
  } catch (error) {
    console.error("fetchIncidentClaimsAndRevisions failed open", error);
    return empty;
  }

  if (claimErr) {
    console.error("fetchIncidentClaims failed", claimErr);
  }
  if (revErr) {
    console.error("fetchIncidentRevisions failed", revErr);
  }

  const claims: IncidentClaimRecord[] =
    (claimRows as Array<Record<string, unknown>> | null)?.map((row) => ({
      id: String(row.id),
      field: String(row.field),
      value: String(row.value ?? ""),
      sourceUrl: typeof row.source_url === "string" ? row.source_url : null,
      snippet: typeof row.snippet === "string" ? row.snippet : null,
      confidence: typeof row.confidence === "number" ? row.confidence : null,
      inferredBy:
        row.inferred_by === "source" || row.inferred_by === "model" || row.inferred_by === "heuristic"
          ? row.inferred_by
          : "heuristic",
      createdAt: String(row.created_at ?? ""),
    })) ?? [];

  const revisions: IncidentRevisionRecord[] =
    (revRows as Array<Record<string, unknown>> | null)?.map((row) => ({
      id: String(row.id),
      revisionNo: Number(row.revision_no ?? 0),
      changedFields: Array.isArray(row.changed_fields) ? (row.changed_fields as string[]) : [],
      previousValues:
        row.previous_values && typeof row.previous_values === "object"
          ? (row.previous_values as Record<string, unknown>)
          : {},
      newValues:
        row.new_values && typeof row.new_values === "object" ? (row.new_values as Record<string, unknown>) : {},
      source: String(row.source ?? "system"),
      note: typeof row.note === "string" ? row.note : null,
      createdAt: String(row.created_at ?? ""),
    })) ?? [];

  return { claims, revisions };
}
