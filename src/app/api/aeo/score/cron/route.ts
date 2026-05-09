import { NextResponse } from "next/server";
import pLimit from "p-limit";

import { assertCronAuthorized } from "@/lib/aeo/cron-auth";
import { fetchIncidentContent } from "@/lib/aeo/incident-content";
import { POST as scoreIncidentPost } from "@/app/api/aeo/score/incident/route";
import { selectActiveCorpus } from "@/lib/aeo/score";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const t0 = Date.now();
  const incidents = await selectActiveCorpus({ windowDays: 30, staleAfterHours: 24 });
  const secret = process.env.CRON_SECRET!;
  const limit = pLimit(5);

  let completed = 0;
  let failed = 0;

  await Promise.all(
    incidents.map((i) =>
      limit(async () => {
        try {
          const incident = await fetchIncidentContent(i.id);
          if (!incident) {
            failed += 1;
            return;
          }
          const workerReq = new Request("http://local/api/aeo/score/incident", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${secret}`,
            },
            body: JSON.stringify({ incidentId: i.id }),
          });
          const res = await scoreIncidentPost(workerReq);
          if (res.ok) completed += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }),
    ),
  );

  const durationMs = Date.now() - t0;
  const estCostUsd = incidents.length * 0.01;
  console.log(
    JSON.stringify({
      job: "aeo_score_cron",
      queued: incidents.length,
      completed,
      failed,
      durationMs,
      estCostUsd,
    }),
  );

  return NextResponse.json({
    ok: true,
    queued: incidents.length,
    completed,
    failed,
    durationMs,
    estCostUsd,
  });
}
