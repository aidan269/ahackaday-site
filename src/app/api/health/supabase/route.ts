import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lightweight connectivity check for Supabase (incidents table).
 * GET /api/health/supabase
 */
export async function GET() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return Response.json(
      {
        ok: false,
        configured: false,
        error: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_* + anon for read-only check).",
      },
      { status: 503 },
    );
  }

  const supabase = createClient(url, key);
  const { error, count } = await supabase
    .from("incidents")
    .select("id", { count: "exact", head: true });

  if (error) {
    return Response.json(
      {
        ok: false,
        configured: true,
        reachable: false,
        error: error.message,
        code: error.code,
        hint:
          /relation|does not exist|schema cache/i.test(error.message)
            ? "Run supabase/migrations/20260427000000_incidents.sql in the Supabase SQL editor."
            : undefined,
      },
      { status: 503 },
    );
  }

  return Response.json({
    ok: true,
    configured: true,
    reachable: true,
    incident_count: count ?? 0,
    data_source: process.env.DATA_SOURCE ?? "markdown",
  });
}
