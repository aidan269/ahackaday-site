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

## Minimum daily digest payload

`GET /api/ops/weekly-aeo` (daily semantics for v1) should include:

- `digest_date` (or `week_of` during compatibility window)
- `generated_at`
- `topics[]`
- `opportunities[]`
- `recommendations[]`
- `feedback[]`

If Grace returns sparse digest data, AHackaday will compute a local fallback digest from the feed.

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
- Known-good fixture: `tests/fixtures/grace-incident-state.good.json`.
- Keep the Grace-side repo contract docs in sync with this file after API changes.

## What this panel tells you daily

- **Top opportunities today**: where AHackaday can publish answer-first content before competitors.
- **Recommended actions**: the 3 highest-priority content moves for the current day.
- **Feedback to improve rank**: concrete structure/copy changes that increase AI citation likelihood.
