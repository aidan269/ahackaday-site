# Grace Ops Contract (AHackaday)

This document defines the minimum contract between AHackaday and Grace for incident-scoped Ops rendering.

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
