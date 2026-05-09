import { NextResponse } from "next/server";

import { assertCronAuthorized } from "@/lib/aeo/cron-auth";
import { runDigest } from "@/lib/aeo/digest";
import { getPublicSiteUrl } from "@/lib/ecosystem";
import { postSlackIncomingWebhook } from "@/lib/slack";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const t0 = Date.now();
  let result: Awaited<ReturnType<typeof runDigest>>;
  try {
    result = await runDigest();
  } catch (e) {
    console.log(JSON.stringify({ job: "aeo_digest", ok: false, error: String(e), durationMs: Date.now() - t0 }));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }

  const webhook = process.env.SLACK_AEO_DIGEST_WEBHOOK_URL?.trim();
  if (webhook && result.pages_scored > 0) {
    const site = getPublicSiteUrl();
    const digestUrl = `${site}/admin/aeo/digest/${result.week_start}`;
    const deltaLine =
      result.delta_vs_prev_week == null
        ? "n/a (first week)"
        : `${result.delta_vs_prev_week >= 0 ? "+" : ""}${result.delta_vs_prev_week}`;
    await postSlackIncomingWebhook(webhook, {
      text: `AEO weekly digest · avg ${result.avg_score}/100 (${deltaLine} vs prior) · ${result.pages_scored} pages · ${digestUrl}`,
    });
  }

  console.log(JSON.stringify({ job: "aeo_digest", ok: true, ...result, durationMs: Date.now() - t0 }));

  return NextResponse.json({ ok: true, ...result });
}
