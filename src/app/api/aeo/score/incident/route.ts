import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { getAnthropicClient } from "@/lib/aeo/anthropic";
import { assertCronAuthorized } from "@/lib/aeo/cron-auth";
import { fetchIncidentContent } from "@/lib/aeo/incident-content";
import { buildScoringPrompt, SUBMIT_AEO_ANALYSIS_TOOL } from "@/lib/aeo/prompts";
import {
  lastScore,
  recordFailure,
  shouldSkipAeoRescore,
  touchScoredAt,
  upsertScore,
  type AeoSubScores,
} from "@/lib/aeo/score";

export const runtime = "nodejs";
export const maxDuration = 30;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  let body: { incidentId?: string };
  try {
    body = (await req.json()) as { incidentId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const incidentId = body.incidentId?.trim();
  if (!incidentId) {
    return NextResponse.json({ ok: false, error: "incidentId required" }, { status: 400 });
  }

  const incident = await fetchIncidentContent(incidentId);
  if (!incident) {
    return NextResponse.json({ ok: false, error: "Incident not found" }, { status: 404 });
  }

  const contentHash = crypto.createHash("sha256").update(incident.content).digest("hex");
  const last = await lastScore(incidentId);
  if (shouldSkipAeoRescore({ lastContentHash: last?.content_hash ?? null, lastScoredAt: last?.scored_at ?? null, contentHash })) {
    await touchScoredAt(incidentId);
    return NextResponse.json({ ok: true, skipped: "unchanged" });
  }

  const lowContent = wordCount(incident.content) < 50;
  const model = process.env.AEO_SCORING_MODEL?.trim() || "claude-sonnet-4-6";

  const anthropic = getAnthropicClient();
  let response: Awaited<ReturnType<typeof anthropic.messages.create>> | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await anthropic.messages.create({
        model,
        max_tokens: 4000,
        system: buildScoringPrompt(),
        messages: [
          {
            role: "user",
            content: `URL: ${incident.url}\n\nPage content:\n\n${incident.content}`,
          },
        ],
        tools: [SUBMIT_AEO_ANALYSIS_TOOL as never],
        tool_choice: { type: "tool", name: "submit_aeo_analysis" },
      });
      break;
    } catch (err) {
      if (attempt === 3) {
        await recordFailure({ incidentId, url: incident.url, attempt, err });
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
      }
      await sleep(2 ** attempt * 1000);
    }
  }

  if (!response) {
    return NextResponse.json({ ok: false, error: "No response" }, { status: 500 });
  }

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    await recordFailure({ incidentId, url: incident.url, attempt: 0, err: new Error("no tool_use in response") });
    return NextResponse.json({ ok: false, error: "no tool_use" }, { status: 500 });
  }

  const input = toolUse.input as {
    sub_scores: AeoSubScores;
    one_line_diagnosis: string;
    recommendations: unknown;
  };

  const recommendations = Array.isArray(input.recommendations)
    ? input.recommendations.filter(
        (r): r is { issue: string; current_text: string; suggested_rewrite: string; why_it_helps: string } =>
          Boolean(r) &&
          typeof r === "object" &&
          typeof (r as { issue?: unknown }).issue === "string" &&
          typeof (r as { current_text?: unknown }).current_text === "string" &&
          typeof (r as { suggested_rewrite?: unknown }).suggested_rewrite === "string" &&
          typeof (r as { why_it_helps?: unknown }).why_it_helps === "string",
      )
    : [];

  const total = Object.values(input.sub_scores ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);

  await upsertScore({
    incidentId,
    url: incident.url,
    model,
    total_score: total,
    sub_scores: input.sub_scores,
    one_line_diagnosis: input.one_line_diagnosis,
    recommendations,
    low_content: lowContent,
    content_hash: contentHash,
    raw_response_id: response.id,
  });

  return NextResponse.json({ ok: true, total_score: total });
}
