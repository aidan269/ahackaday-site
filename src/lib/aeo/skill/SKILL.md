---
name: aeo-geo-analyzer
description: Audit website and blog content from an Answer Engine Optimization (AEO) and Generative Engine Optimization (GEO) perspective so it ranks better in AI search surfaces like ChatGPT, Perplexity, Claude, Gemini, and Google AI Overviews. Use this skill whenever the user mentions AEO, GEO, AI search optimization, citation-worthiness, getting cited by LLMs, ranking in AI search, content audits for LLM visibility, or wants weekly content recommendations, topic ideas, or page-level edit feedback to improve AI search performance. Also trigger when the user asks why their content is not getting cited by ChatGPT/Perplexity/Claude, how to make content LLM-friendly, how to plan a content calendar for AI search, or wants to score how citation-worthy a page is. Trigger even if the user does not say "AEO" or "GEO" by name — phrases like "rank in AI search," "get cited by ChatGPT," "show up in AI Overviews," or "LLM-friendly content" all qualify.
---

# AEO / GEO Content Analyzer

Audits content for Answer Engine Optimization (AEO) and Generative Engine Optimization (GEO), and produces a weekly report with topic ideas, recommendations, and edit-level feedback.

## Why this matters

Traditional SEO ranks pages. AEO/GEO ranks **passages** — the specific paragraphs, lists, or quotes that an LLM lifts into its answer with a citation. The model is the new gatekeeper, and it scans for: a direct answer near the top, named statistics, named experts, structured data, fresh dates, and clear topical authority. Content that wins in Google's classic SERP often loses here, because LLMs skip preamble and reward density.

The whole value of this skill is **specificity**. Generic advice like "add more statistics" is worthless — the user can get that from a blog post. What they cannot get elsewhere is: "in `/blog/audit-process`, replace the second paragraph's hedged claim with this rewritten sentence that quotes a named statistic." That is what this skill produces.

## Inputs

Ask the user for one of:
- A list of URLs (most common — paste, or read from a sitemap)
- A single page to deep-dive
- A topic or domain to plan around (no existing content yet)
- A sitemap.xml or RSS feed

Also ask, on the first run only:
- Their domain and one-line positioning
- 3–5 priority topic clusters (so recommendations stay on-strategy)
- 1–3 competitors whose content currently shows up in AI answers for their target queries

Save these to `aeo-config.md` in the current working directory so future weekly runs do not re-ask. On subsequent runs, read `aeo-config.md` first and confirm anything has not changed before proceeding.

## Workflow

### 1. Fetch and inventory

Use WebFetch on each URL. For a sitemap, parse the XML and pick the 5–15 most strategically important or most recently updated pages for this week's audit. Do not try to score every page every week — the report becomes noise. If the user has hundreds of pages, prioritize: (a) anything published or updated in the last 14 days, (b) pages on the priority topic clusters, (c) pages already getting some traffic but no AI citations.

For audits of 20+ pages, fetch and score in parallel by spawning subagents — one per page or one per cluster. Each subagent returns a scored result; you aggregate.

### 2. Score each page

Score against the rubric in `references/scoring-rubric.md`. The rubric produces a 0–100 citation-worthiness score with sub-scores for:
- Direct answer up front (is the answer in the first 100 words?)
- Statistics and evidence (named numbers, sources, primary data)
- Structure (H2/H3 questions, lists, tables, FAQ blocks, schema markup)
- Authority and E-E-A-T (named author, credentials, bio, original research)
- Freshness (visible publish/update date, recency of cited sources)
- Topical depth (does the page cover the related sub-questions a user would also ask?)

Read the rubric file before scoring — do not score from memory.

### 3. Generate page-level feedback

For each page, produce 3–7 concrete edits. The format is non-negotiable:

> **Issue:** \<one sentence describing what is hurting citation-worthiness\>
> **Current text:** "\<exact quoted passage from the page\>"
> **Suggested rewrite:** "\<rewritten passage, including any named stat or source\>"
> **Why this helps:** \<one sentence tying it to AEO/GEO behavior\>

The user should be able to hand these edits to a writer or paste them into a doc with zero further translation. If you cannot quote the exact passage and propose specific replacement text, the recommendation is not ready — keep working on it.

See `references/citation-patterns.md` for the catalog of patterns LLMs reward and the anti-patterns they punish. Skim this before generating feedback — the patterns are how you find concrete edits rather than generic advice.

### 4. Generate the weekly topic queue

Use the methods in `references/topic-research.md` to propose 5–10 topics for the coming week, ranked by AI-search opportunity. Each topic entry includes:
- Target user query (the actual phrase a user would type into ChatGPT or Perplexity)
- Why it is underserved (or why competitors are winning it weakly)
- The angle the user's brand should take
- A draft H1 and a draft 40-word TL;DR that would itself be citation-worthy

### 5. Deliver the report

Write the report to `aeo-weekly-YYYY-MM-DD.md` in the working directory, using the structure in `references/report-template.md`. Do not improvise the structure — the user reads these reports every week and consistency matters more than novelty.

## Three traps to avoid

1. **Generic advice.** "Add more statistics" is useless. Specificity is the entire product: which sentence, replaced with what, citing which source.
2. **SEO-brain.** Keyword density, meta descriptions, and link-building barely move the needle for AI search. Don't pad recommendations with classic SEO checklist items unless they directly affect citation behavior. Schema markup does. Meta keywords don't. H1 keyword stuffing makes things worse, not better, because LLMs treat unnatural text as low quality.
3. **Hedging.** LLMs cite confident, declarative passages. If a page says "some experts believe X may possibly be true in some cases," it will not get cited. Flag hedging language in feedback and rewrite as direct claims, where the underlying evidence supports it. Where it does not, recommend the user go gather the evidence — that is itself a topic recommendation.

## Reference files

- `references/scoring-rubric.md` — the 0–100 scoring framework, with sub-scores
- `references/citation-patterns.md` — what LLMs reward and punish, with examples
- `references/topic-research.md` — how to find query gaps and topic opportunities
- `references/report-template.md` — the weekly report structure
