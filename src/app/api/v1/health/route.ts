import {
  checkApiRateLimit,
  getHealthPayload,
  makeApiHeaders,
} from "@/lib/api-v1";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const rate = checkApiRateLimit(request);
  if (!rate.ok) {
    return Response.json(
      { error: "Rate limit exceeded. Please retry shortly." },
      { status: 429, headers: makeApiHeaders({ retryAfterSeconds: rate.retryAfterSeconds }) },
    );
  }

  const payload = await getHealthPayload();
  return Response.json(payload, { headers: makeApiHeaders() });
}
