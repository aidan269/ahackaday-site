import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "CMS draft endpoint not implemented — no headless CMS in this repo." },
    { status: 501 },
  );
}
