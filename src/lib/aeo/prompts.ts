/**
 * Source: https://github.com/aidan269/aeo-geo-analyzer-plugin-
 * Commit: f96bbe85e203187e4c28a4e3d4e2de8c8a02cd0e
 * Vendored: 2026-05-07
 * Re-vendor when bumping the skill version.
 */

import fs from "node:fs";
import path from "node:path";

const SKILL_DIR = path.join(process.cwd(), "src/lib/aeo/skill");

function read(rel: string): string {
  return fs.readFileSync(path.join(SKILL_DIR, rel), "utf8");
}

const SCORING_PROMPT_BODY = [
  read("SKILL.md"),
  read("references/scoring-rubric.md"),
  read("references/citation-patterns.md"),
  `---

## API mode override

You are operating in API mode for a single page, not the interactive weekly workflow.

- Score this one page against the rubric in scoring-rubric.md.
- Walk through the anti-patterns in citation-patterns.md to find concrete edits.
- Quote exact passages from the provided page content for "current_text". If you cannot find an exact quote that supports a recommendation, drop that recommendation.
- Return 3–7 recommendations. Fewer than 3 is unusual; if you genuinely cannot find 3, return what you can.
- Do not produce a weekly report, topic queue, or markdown narrative. Return structured output via the submit_aeo_analysis tool only.`,
].join("\n\n");

/** System prompt blocks for Anthropic Messages API (prompt caching on first block). */
export function buildScoringPrompt() {
  return [
    {
      type: "text" as const,
      text: SCORING_PROMPT_BODY,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

const WEEKLY_DIGEST_PROMPT_BODY = [
  read("SKILL.md"),
  read("references/scoring-rubric.md"),
  read("references/citation-patterns.md"),
  read("references/topic-research.md"),
  read("references/report-template.md"),
  `---

## API mode override — weekly digest

You are producing the weekly topic queue and cross-page patterns ONLY. Page-level scoring has already been done. Use the supplied score summary and edit suggestions as input. Return structured output via the submit_weekly_digest tool only. Do not write a markdown narrative.`,
].join("\n\n");

export function buildWeeklyDigestPrompt() {
  return [
    {
      type: "text" as const,
      text: WEEKLY_DIGEST_PROMPT_BODY,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

export const SUBMIT_AEO_ANALYSIS_TOOL = {
  name: "submit_aeo_analysis",
  description: "Submit AEO/GEO scoring and recommendations for the page.",
  input_schema: {
    type: "object",
    required: ["sub_scores", "one_line_diagnosis", "recommendations"],
    properties: {
      sub_scores: {
        type: "object",
        required: ["direct_answer", "statistics", "structure", "authority", "freshness", "topical_depth"],
        properties: {
          direct_answer: { type: "integer", minimum: 0, maximum: 20 },
          statistics: { type: "integer", minimum: 0, maximum: 20 },
          structure: { type: "integer", minimum: 0, maximum: 15 },
          authority: { type: "integer", minimum: 0, maximum: 15 },
          freshness: { type: "integer", minimum: 0, maximum: 15 },
          topical_depth: { type: "integer", minimum: 0, maximum: 15 },
        },
      },
      one_line_diagnosis: { type: "string", maxLength: 200 },
      recommendations: {
        type: "array",
        minItems: 1,
        maxItems: 7,
        items: {
          type: "object",
          required: ["issue", "current_text", "suggested_rewrite", "why_it_helps"],
          properties: {
            issue: { type: "string" },
            current_text: { type: "string" },
            suggested_rewrite: { type: "string" },
            why_it_helps: { type: "string" },
          },
        },
      },
    },
  },
} as const;

export const SUBMIT_WEEKLY_DIGEST_TOOL = {
  name: "submit_weekly_digest",
  description: "Submit weekly cross-page patterns and topic queue for editorial planning.",
  input_schema: {
    type: "object",
    required: ["top_patterns", "topic_queue"],
    properties: {
      top_patterns: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
      topic_queue: {
        type: "array",
        minItems: 5,
        maxItems: 10,
        items: {
          type: "object",
          required: ["target_query", "why_underserved", "brand_angle", "draft_h1", "draft_tldr_40w"],
          properties: {
            target_query: { type: "string" },
            why_underserved: { type: "string" },
            brand_angle: { type: "string" },
            draft_h1: { type: "string" },
            draft_tldr_40w: { type: "string" },
          },
        },
      },
    },
  },
} as const;
