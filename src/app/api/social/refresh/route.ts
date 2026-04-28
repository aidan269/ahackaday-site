import { revalidateTag } from "next/cache";

import { assertSocialRefreshAuthorized, refreshIncidentSocialMetrics } from "@/lib/social-refresh";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readLimit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (!raw) return 20;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, 200);
}

async function run(request: Request) {
  const unauthorized = assertSocialRefreshAuthorized(request);
  if (unauthorized) return unauthorized;

  const limit = readLimit(new URL(request.url));
  const result = await refreshIncidentSocialMetrics(limit);
  if (result.updated > 0) {
    revalidateTag("incidents", "max");
  }
  return Response.json({ ...result, limit });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
