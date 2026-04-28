import {
  checkApiRateLimit,
  getIncidentDetailPayload,
  makeApiHeaders,
} from "@/lib/api-v1";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  const rate = checkApiRateLimit(request);
  if (!rate.ok) {
    return Response.json(
      { error: "Rate limit exceeded. Please retry shortly." },
      { status: 429, headers: makeApiHeaders({ retryAfterSeconds: rate.retryAfterSeconds }) },
    );
  }

  const { slug } = await params;
  const payload = await getIncidentDetailPayload(slug);
  if ("error" in payload) {
    return Response.json(
      { error: payload.error },
      { status: payload.status, headers: makeApiHeaders() },
    );
  }

  return Response.json(payload, { headers: makeApiHeaders() });
}
