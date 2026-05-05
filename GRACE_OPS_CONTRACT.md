# Grace Ops Contract (AHackaday)

This document defines the minimum contract between AHackaday and Grace for marketing-oriented Grace Ops rendering.

## Required AHackaday env vars

- `OPS_PACK_GRACE_ENABLED=1`
- `NEXT_PUBLIC_OPS_PACK_GRACE_ENABLED=1`
- `GRACE_SERVICE_ORIGIN=https://askgrace.xyz` (or the active Grace backend origin)

Optional mapping/fallback vars:

- `GRACE_WORKSPACE_MAP_JSON` (tenant-to-workspace map, JSON string)
- `GRACE_WORKSPACE_ID` (global workspace fallback when tenant map is missing)

## Incident identity contract

- AHackaday computes deterministic `incident_key` from:
  - normalized incident URL (lowercase host/protocol, no hash, strip `utm_*`, trim slash)
  - plus optional publish timestamp
- Grace must preserve and scope report materialization by this `incident_key`.

## Workspace mapping behavior

AHackaday resolves workspace in this order:

1. `GRACE_WORKSPACE_MAP_JSON` lookup by tenant id
2. Supabase mapping table (`grace_workspace_mappings`)
3. Grace `/api/discover` best-effort resolution
4. `GRACE_WORKSPACE_ID` or `default` fallback

Grace should normalize aliases/default values to canonical UUIDs before report lookup.

## Required Grace endpoints

- `POST /api/grace-weekly`
- `GET /api/grace-report?workspace_id=...&incident_key=...`
- `POST /api/grace-approvals`
- `GET /api/discover`

## AHackaday digest BFF (`GET /api/ops/weekly-aeo`)

The route always derives a **local feed digest first**, then merges a **Grace workspace digest** when the remote call succeeds. Response envelope:

```json
{
  "ok": true,
  "brief": { "...GraceOpsDailyDigest V2..." },
  "source_mode": "hybrid | local_fallback",
  "data_quality": { "completeness": 0 }
}
```

- **`source_mode`**
  - `local_fallback` — only AHackaday feed-derived structured digest (Grace unreachable or Grace added nothing beyond local).
  - `hybrid` — Grace workspace payload contributed at least one of: structured items, legacy string arrays, or feedback rows that were folded in.
- **`data_quality.completeness`** — 0–100 heuristic from theme coverage, structured opportunities/recommendations, and feedback depth.

### GraceOps daily digest V2 (`brief`)

| Field | Description |
| --- | --- |
| `version` | `2` |
| `digest_date` | UTC `YYYY-MM-DD` |
| `generated_at` | ISO timestamp |
| `themes[]` | Editorial tokens (severity labels are **not** used as standalone themes) |
| `signals_summary` | Optional one-line severity / attention snapshot |
| `opportunity_items[]` | Structured gap cards (`opportunity_title`, `why_now`, `recommended_angle`, `expected_impact`, `confidence`, `evidence_refs`) |
| `recommendation_items[]` | Structured actions (`action`, `expected_impact`, `confidence`, `source`: `feed_digest` \| `grace_workspace`) |
| `feedback[]` | Rank / structure guidance lines |
| `topics[]` | Mirrors `themes` for backward compatibility |
| `opportunities[]` | One-line summaries derived from `opportunity_items` |
| `recommendations[]` | One-line summaries derived from `recommendation_items` |
| `supporting_metrics` | Optional Grace telemetry passthrough (`north_star`, `answer_inclusion`, etc.) |

### Grace workspace digest (optional enhancement)

Grace `GET /api/ops/weekly-aeo` may return V2 JSON with `opportunity_items` / `recommendation_items`, or **legacy** `topics` / `opportunities` / `recommendations` strings — AHackaday normalizes both before merging.

## Minimum incident report payload

`GET /api/grace-report` should include:

- `north_star`
- `answer_inclusion`
- `freshness`
- `open_actions`
- `recommendations[]`
- `runs[]` and/or `latest_run`
- `extracted_indicators[]`
- `top_recommendation` (or enough data for AHackaday to derive it)
- `stale` flag (optional; AHackaday can derive if absent)

## Monitoring and regression

- AHackaday logs incident-state top-recommendation coverage every 20 responses.
- Known-good fixtures:
  - `tests/fixtures/grace-incident-state.good.json`
  - `tests/fixtures/grace-daily-aeo.good.json` (V2 digest envelope)
- Keep the Grace-side repo contract docs in sync with this file after API changes.

## What this panel tells you daily

- **Themes vs signals**: *Themes* are editorial clusters; *signals* summarize severity mix without turning severity into fake topic names.
- **Top opportunities today**: structured gap analysis (Cantina contrast, confidence, evidence URLs when present).
- **Recommended actions**: each line includes action, expected impact, and **source** (`feed digest` vs `grace workspace`).
- **Feedback to improve rank**: aggregate feed notes plus digest quality completeness.
- **Page score**: per-incident blend of freshness + answer-inclusion (0–100) — distinct from workspace digest completeness.
