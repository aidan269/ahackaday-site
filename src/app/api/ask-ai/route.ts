import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getAnthropicModel } from "@/lib/anthropic-model";
import { buildIncidentBriefLines, primaryTrackingId } from "@/lib/build-ask-ai-context";
import { getIncidentBySlug } from "@/lib/incidents";
import { deriveRateLimitKey, takeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_QUESTION_CHARS = 3_500;
const ASK_AI_RATE_LIMIT_MAX = 8;
const ASK_AI_RATE_LIMIT_WINDOW_MS = 60_000;

const ROLES = ["SOC analyst", "Eng lead", "Exec", "Comms"] as const;
const TONES = ["brief", "checklist", "slack-ready"] as const;
const PROMPT_IDS = ["tldr", "triage", "escalate", "exec"] as const;

type AskAiPayload = {
  incidentSlug?: string;
  role?: string;
  tone?: string;
  promptId?: string;
  question?: string;
};

const PROMPT_TEXT: Record<(typeof PROMPT_IDS)[number], string> = {
  tldr: "Give me a tight TL;DR in 3 short bullets. No fluff.",
  triage: "Create a practical 30-minute triage plan: owner, urgency, top 3 actions now.",
  escalate: "Should we escalate right now? Answer yes/no first, then why and what would change the call.",
  exec: "Write a leadership-safe update: what happened, business risk, what we're doing now, and support needed.",
};

function roleIsValid(value: string): value is (typeof ROLES)[number] {
  return (ROLES as readonly string[]).includes(value);
}

function toneIsValid(value: string): value is (typeof TONES)[number] {
  return (TONES as readonly string[]).includes(value);
}

function promptIdIsValid(value: string): value is (typeof PROMPT_IDS)[number] {
  return (PROMPT_IDS as readonly string[]).includes(value);
}

function formatInstructionForMode(mode: (typeof TONES)[number]): string {
  if (mode === "checklist") return "Format as a checklist with dash bullets and clear owners/actions.";
  if (mode === "slack-ready") return "Format as a compact Slack-ready message with short lines and actionable bullets.";
  return "Format as a concise brief with short paragraphs and bullets where useful.";
}

async function getAuthedUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;
  const token = match[1].trim();
  if (!token) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return data.user.id;
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Authentication required for Ask AI." }, { status: 401 });
    }

    const key = `${deriveRateLimitKey(request)}::uid:${userId}`;
    const quota = takeRateLimit(key, {
      max: ASK_AI_RATE_LIMIT_MAX,
      windowMs: ASK_AI_RATE_LIMIT_WINDOW_MS,
    });
    if (!quota.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please retry shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(quota.retryAfterSeconds),
          },
        },
      );
    }

    const body = (await request.json()) as AskAiPayload;
    const incidentSlug = typeof body.incidentSlug === "string" ? body.incidentSlug.trim() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const tone = typeof body.tone === "string" ? body.tone.trim() : "";
    const promptIdRaw = typeof body.promptId === "string" ? body.promptId.trim() : "";
    const questionRaw = typeof body.question === "string" ? body.question.trim() : "";

    if (!incidentSlug) {
      return NextResponse.json({ error: "Missing incident slug." }, { status: 400 });
    }
    if (!roleIsValid(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    if (!toneIsValid(tone)) {
      return NextResponse.json({ error: "Invalid tone." }, { status: 400 });
    }
    const promptId = promptIdRaw && promptIdIsValid(promptIdRaw) ? promptIdRaw : null;
    const question = questionRaw.slice(0, MAX_QUESTION_CHARS);
    const effectivePrompt = question || (promptId ? PROMPT_TEXT[promptId] : "");
    if (!effectivePrompt) {
      return NextResponse.json({ error: "Missing question or prompt selection." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Ask AI is unavailable in this preview — needs Claude runtime." },
        { status: 503 },
      );
    }

    const incident = await getIncidentBySlug(incidentSlug);
    if (!incident) {
      return NextResponse.json({ error: "Incident not found." }, { status: 404 });
    }

    const trackingId = primaryTrackingId(incident);
    const contextLines = [
      `Incident title: ${incident.title}`,
      `Severity: ${incident.severity}`,
      `Category: ${incident.category}`,
      `Affected: ${incident.affected}`,
      trackingId ? `Tracking ID: ${trackingId}` : "",
      `Mitigation status: ${incident.mitigationStatus}`,
      `Exploited in the wild: ${incident.exploited ? "yes" : "no"}`,
      `Social quality: ${incident.socialDataQuality ?? "pending"}`,
      `Social mentions (24h): ${incident.socialMentions24h ?? 0}`,
      `Social trend: ${incident.socialTrend ?? "flat"}`,
      `Social delta (24h %): ${incident.socialDelta24hPct ?? "n/a"}`,
      incident.socialPlatformSplit
        ? `Platform split: X ${incident.socialPlatformSplit.x}% · Reddit ${incident.socialPlatformSplit.reddit}% · GitHub ${incident.socialPlatformSplit.github}%`
        : "",
      `X mentions (24h): ${incident.xMentions24h ?? 0}`,
      `X unique authors (24h): ${incident.xUniqueAuthors24h ?? 0}`,
      `X verified mentions (24h): ${incident.xVerifiedMentions24h ?? 0}`,
      `X heat score: ${incident.xHeatScore ?? 0}`,
      `X heat trend: ${incident.xHeatTrend ?? "flat"}`,
      `X top hashtags: ${(incident.xTopHashtags ?? []).slice(0, 5).join(", ") || "n/a"}`,
      `Summary: ${incident.summary}`,
      "",
      ...buildIncidentBriefLines(incident),
    ].filter(Boolean);

    const structureInstruction = promptId === "tldr"
      ? "Keep it crisp and factual."
      : `Use this exact structure:
- What changed
- Why it matters
- Next 30 minutes
- Owner
- Decision call
- Confidence and unknowns`;
    const systemPrompt = `You are an analyst helping a security/platform engineer understand a cybersecurity incident.
Use ONLY the provided incident brief as ground truth. Be concise, direct, and plain-spoken.
Do not critique the incident taxonomy or classification labels.
If details are missing, state the specific uncertainty briefly, then still provide the most practical impact/risk interpretation possible from available facts.
Role mode: ${role}.
${formatInstructionForMode(tone)}
${structureInstruction}
Always include "Confidence: <high|medium|low>" and "Unknowns: <bullet list>" at the end for non-TL;DR responses.`;

    const userPrompt = `--- INCIDENT BRIEF ---
${contextLines.join("\n")}
--- END BRIEF ---

Question: ${effectivePrompt}`;

    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: getAnthropicModel(),
      max_tokens: 1024,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();

    if (!text) {
      return NextResponse.json({ error: "Empty model response" }, { status: 502 });
    }

    return NextResponse.json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `(Error reaching Claude: ${message})` }, { status: 502 });
  }
}
