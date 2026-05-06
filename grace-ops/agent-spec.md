# Grace Ops agent spec

Spec for the agent that powers the redesigned Grace Ops dashboard. Written so an engineer can implement directly.

## Mission

Every day, give the Cantina editorial team a ranked list of cyber-news topics, article briefs, and refresh tasks that maximize the probability of being cited by AI search engines and included verbatim in AI answers.

## Naming

Two outputs from one pipeline:

- **Pulse** — daily breaking-news digest (matches today’s Grace Ops cadence).
- **Briefs** — weekly analytical recommendations (new layer beyond pulse-only).

## Inputs

### 1. Cantina corpus

All published Cantina articles for the trailing 90 days, as `{ url, title, body_html, published_at, author, tags }`.

Pulled via Cantina’s CMS API (or RSS as a fallback). Re-pulled hourly.

### 2. Competitor corpus

Default benchmark set (editable):

- BleepingComputer  
- The Hacker News  
- SecurityWeek  
- Krebs on Security  
- Dark Reading  
- The Record (Recorded Future)

For each competitor: trailing 14 days of articles via RSS + a follow-up `web_fetch` for full body. Same `{ url, title, body, published_at, tags }` shape.

### 3. Query feed

Daily list of trending cyber-related questions from:

- Google Trends (cybersecurity category)  
- Reddit `r/cybersecurity`, `r/netsec`, `r/sysadmin` top weekly questions  
- AnswerThePublic for seed cyber terms  
- Internal Cantina search-log queries that returned &lt;3 results  

Each entry: `{ query, source, weekly_volume_estimate, intent }` where `intent` ∈ `{ informational, navigational, transactional, comparative }`.

### 4. AI engine probes

Synthetic GEO probes — for the top 25 queries each day, run them through:

- Perplexity API  
- Google AI Overviews (via SerpAPI `engine=google_ai_overview`)  
- ChatGPT Search API  
- Claude.ai web search (manual or via internal harness)  
- You.com smart mode  

For each, capture: cited domains, cited URLs, our citation present (yes/no), our position in citation list.

## Pipeline stages

```
ingest → embed → cluster → gap-detect → audit → geo-probe → synthesize → publish
```

### Stage 1 — Ingest

- Fetch all sources above into a normalized **Article** and **Query** shape.  
- De-dupe on URL.  
- Strip boilerplate; keep H1–H3 structure and first paragraph as lede.

### Stage 2 — Embed

- Vectorize each article body with a sentence embedding model (e.g. `text-embedding-3-small`).  
- Cache by URL hash. Articles older than 90 days drop out of the live index.

### Stage 3 — Cluster

- HDBSCAN over the rolling 14-day vectors to produce theme clusters.  
- Label each cluster with an LLM call: 3-word theme name + one-sentence description.  
- Persist cluster IDs day-to-day so themes are stable.

### Stage 4 — Gap detection

For each cluster:

- `competitor_count` = articles from competitor set in the cluster  
- `cantina_count` = articles from Cantina in the cluster  
- `gap_score` = `(competitor_count − cantina_count) / max(1, competitor_count)`  
- Severity from max competitor severity tag (`critical`, `high`, `medium`, `low`)

Sort clusters by `severity × gap_score × momentum_decay(age)`.

### Stage 5 — AEO audit

For every Cantina article published in the last 30 days, score against a 14-point rubric:

| # | Check | Weight |
|---|--------|--------|
| 1 | Lede answers the query in first 120 words | 12 |
| 2 | H2/H3 hierarchy mirrors common subquestions | 10 |
| 3 | Page contains a FAQ block (`<dl>` or schema.org/FAQPage) | 10 |
| 4 | At least 3 cited authoritative sources (CISA, NVD, vendor advisory, peer-reviewed) | 10 |
| 5 | Numeric stats with units present (CVE IDs, version numbers, dates, percentages) | 8 |
| 6 | Internal links to ≥2 related Cantina articles | 6 |
| 7 | Schema.org NewsArticle JSON-LD present and valid | 8 |
| 8 | Article date and `updated_at` exposed in markup | 6 |
| 9 | Headline matches a real query (matches ≥1 entry from query feed) | 8 |
| 10 | Reading level grade ≤ 11 | 4 |
| 11 | Answer-first paragraph ≤ 60 words | 6 |
| 12 | Includes a “What changed” or TL;DR block | 4 |
| 13 | Image with alt text describing the threat/diagram | 4 |
| 14 | Author bio with credentials linkable | 4 |

**Total = 100.** Each check returns `{ passed: bool, evidence: str, fix_suggestion: str | null }`.

### Stage 6 — GEO probing

For each of the day’s top 25 queries:

- Run through each AI engine.  
- Record: did our domain appear, position, competitor domains, direct quotes the engine pulled.  
- Persist into a `geo_signals` time series (per query, per engine, per day).  
- Compute: **citation share** = our citations / total citations across the matrix.

### Stage 7 — Synthesis

The synthesis step is one or more LLM calls that take structured outputs from stages 4–6 and produce, in order:

**a) Pulse opportunities (daily):** for each top-3 cluster, generate a unique Angle, Impact, and 2–3 ref-cards. Each ref-card = `{ title, source, published_at, one_line_takeaway, url }`. Forbid template re-use across clusters (enforce by string-similarity threshold across one batch).

**b) Briefs (weekly):** for each top-5 clusters, produce a brief:

```json
{
  "headline": "...",
  "target_query": "...",
  "secondary_queries": ["...", "..."],
  "intent": "informational",
  "outline": [
    { "h2": "...", "bullets": ["...", "..."] }
  ],
  "must_include_facts": ["CVE-2026-1234", "Apache HTTP Server 2.4.x"],
  "must_cite_sources": ["https://nvd.nist.gov/...", "..."],
  "schema_type": "FAQPage",
  "estimated_aeo_lift": "+9 inclusion points",
  "competitor_benchmarks": [
    { "url": "...", "what_they_did_well": "...", "what_they_missed": "..." }
  ],
  "headline_patterns": ["What is X?", "How to mitigate X"]
}
```

**c) Audit fixes:** for each Cantina article scoring &lt;70, pick the 3 highest-leverage fixes from the rubric and produce paste-ready copy for each (e.g. rewritten lede, a specific FAQ block, the JSON-LD blob).

**d) Refresh queue:** for any Cantina article in a cluster that gained ≥2 new competitor stories this week, generate a “What changed” insertion with concrete bullets dated today.

### Stage 8 — Publish

- Write `daily_pulse.json` and `weekly_briefs.json` to the dashboard’s data directory.  
- Update the `geo_signals` time series.  
- Compute hero metrics: `coverage_pct`, `citation_share`, `aeo_median`, `freshness_pct`.  
- Notify ops via Slack with a one-line digest (pulse only).

## Output schema

Top-level shape:

```json
{
  "generated_at": "2026-05-05T08:00:00Z",
  "window": { "start": "2026-04-21", "end": "2026-05-05" },
  "hero_metrics": {
    "coverage_pct": { "value": 0.18, "denominator": 35, "delta_w": 0.1 },
    "citation_share": { "value": 0.07, "denominator": 25, "delta_w": -0.02 },
    "aeo_median": { "value": 62, "denominator": 100 },
    "freshness_pct": { "value": 0.41, "denominator": 17 }
  },
  "themes": [],
  "pulse_opportunities": [],
  "weekly_briefs": [],
  "audit_fixes": [],
  "refresh_queue": [],
  "geo_signals": {}
}
```

The Python prototype `prototype/grace_ops_agent.py` produces a working version of this shape against mock data so the dashboard can be built before real ingestion is wired.

## Cadences

| Cadence | Output | Trigger |
|--------|--------|---------|
| Hourly | Re-fetch Cantina + competitor feeds; recompute clusters | Cron |
| Daily 07:00 | `daily_pulse.json` + Slack digest | Cron |
| Weekly Mon 06:00 | `weekly_briefs.json` + email to editors | Cron |
| Monthly | Retrospective: did briefs move citation share? | Cron + Notion page |

## Metrics the agent measures itself by

| Metric | Definition | Goal |
|--------|------------|------|
| Citation share | Cantina cites / total cites across daily probe matrix | Up week-over-week |
| AEO median | Median rubric score across new articles | ≥ 80 within 60 days |
| Coverage % | Cantina-linked clusters / total live clusters | ≥ 70% |
| Brief activation rate | Briefs that became published articles within 7 days | ≥ 50% |
| Refresh activation rate | Refresh-queue items completed within 5 days | ≥ 70% |
| Inclusion lift after refresh | Δ engine inclusions in 14 days post-refresh | Positive |

## Failure modes and guardrails

- **Hallucinated facts in briefs.** Mitigation: every `must_include_fact` is verified against the source corpus; if a fact isn’t present in any input article, it’s excluded.  
- **Stale embeddings after model swap.** Mitigation: include embedding model version in the cache key.  
- **Template-copy regression (the v1 problem).** Mitigation: hard check that no two same-day briefs share an n-gram of length ≥ 8 in their Angle line.  
- **GEO probes rate-limited.** Mitigation: queue, retry with exponential backoff; partial-update the dashboard rather than failing the whole run.  
- **Recommendation churn.** Mitigation: a brief that appeared in the previous 7 days is re-surfaced, not regenerated, unless underlying facts change.

## Deliberately out of scope

- **Auto-publishing.** The agent never posts; ops always reviews.  
- **Direct CMS edits.** Audit fixes are paste-ready copy; humans paste them.  
- **Forecasting.** Measure citations, not predict them.  
- **Backlink analysis.** Different tool, different team.
