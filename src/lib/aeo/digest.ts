import { createClient } from "@supabase/supabase-js";

import { getAnthropicClient } from "./anthropic";
import { buildWeeklyDigestPrompt, SUBMIT_WEEKLY_DIGEST_TOOL } from "./prompts";

function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function utcMondayContaining(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay(); // 0 Sun .. 6 Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setUTCDate(x.getUTCDate() + offset);
  return x.toISOString().slice(0, 10);
}

export type DigestPageSummary = {
  title: string;
  url: string;
  score: number;
  diagnosis: string;
  top_3_issues: string[];
};

export type RunDigestResult = {
  week_start: string;
  pages_scored: number;
  avg_score: number;
  delta_vs_prev_week: number | null;
};

export async function runDigest(now = new Date()): Promise<RunDigestResult> {
  const supabase = getServiceClient();
  if (!supabase) throw new Error("Supabase service client unavailable");

  const weekStart = utcMondayContaining(now);
  const end = new Date(now);
  const lookbackDays = Math.min(365, Math.max(1, Number(process.env.AEO_DIGEST_LOOKBACK_DAYS ?? "7") || 7));
  const start = new Date(end.getTime() - lookbackDays * 864e5);

  const { data: scores, error: sErr } = await supabase
    .from("aeo_scores")
    .select("incident_id, url, total_score, one_line_diagnosis, scored_at")
    .gte("scored_at", start.toISOString())
    .lte("scored_at", end.toISOString());
  if (sErr) throw sErr;
  const scoreRows = scores ?? [];
  if (scoreRows.length === 0) {
    await supabase.from("aeo_digests").upsert(
      {
        week_start: weekStart,
        pages_scored: 0,
        avg_score: 0,
        delta_vs_prev_week: null,
        top_patterns: [],
        topic_queue: [],
      },
      { onConflict: "week_start" },
    );
    return { week_start: weekStart, pages_scored: 0, avg_score: 0, delta_vs_prev_week: null };
  }

  const pages: DigestPageSummary[] = [];
  for (const row of scoreRows) {
    const incidentId = row.incident_id as string;
    const { data: recs } = await supabase
      .from("aeo_recommendations")
      .select("issue, rank")
      .eq("incident_id", incidentId)
      .eq("dismissed", false)
      .order("rank", { ascending: true })
      .limit(3);
    const titleFromUrl = (() => {
      try {
        const u = new URL(row.url as string);
        const segs = u.pathname.split("/").filter(Boolean);
        return segs[segs.length - 1] ?? incidentId;
      } catch {
        return incidentId;
      }
    })();
    pages.push({
      title: titleFromUrl,
      url: row.url as string,
      score: Number(row.total_score),
      diagnosis: row.one_line_diagnosis as string,
      top_3_issues: (recs ?? []).map((r) => r.issue as string),
    });
  }

  const avg =
    pages.reduce((a, p) => a + p.score, 0) / Math.max(1, pages.length);

  const { data: prev } = await supabase
    .from("aeo_digests")
    .select("avg_score, week_start")
    .lt("week_start", weekStart)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const deltaVsPrev = prev?.avg_score != null ? Number((avg - Number(prev.avg_score)).toFixed(2)) : null;

  const brand = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "AHackaday";
  const userMessage = [
    `Brand: ${brand}`,
    `Week start (UTC Monday): ${weekStart}`,
    `Summary JSON:\n${JSON.stringify(pages, null, 2)}`,
  ].join("\n\n");

  const model = process.env.AEO_DIGEST_MODEL?.trim() || "claude-opus-4-7";
  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: buildWeeklyDigestPrompt(),
    messages: [{ role: "user", content: userMessage }],
    tools: [SUBMIT_WEEKLY_DIGEST_TOOL as never],
    tool_choice: { type: "tool", name: "submit_weekly_digest" },
  });

  const tool = response.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error("No submit_weekly_digest tool_use in response");
  }
  const input = tool.input as { top_patterns: string[]; topic_queue: unknown[] };

  await supabase.from("aeo_digests").upsert(
    {
      week_start: weekStart,
      pages_scored: pages.length,
      avg_score: Number(avg.toFixed(2)),
      delta_vs_prev_week: deltaVsPrev,
      top_patterns: input.top_patterns,
      topic_queue: input.topic_queue,
    },
    { onConflict: "week_start" },
  );

  return {
    week_start: weekStart,
    pages_scored: pages.length,
    avg_score: Number(avg.toFixed(2)),
    delta_vs_prev_week: deltaVsPrev,
  };
}
