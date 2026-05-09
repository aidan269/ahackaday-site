import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(_req: Request, _ctx: { params: Promise<{ id: string }> }) {
  return NextResponse.json(
    {
      ok: false,
      error:
        "APPLY not implemented in v1 — copy the suggested rewrite or wait for the v2 revisions/CMS workflow.",
    },
    { status: 501 },
  );
}
