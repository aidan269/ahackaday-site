# AHackaday Handoff Pack

## 1) Ideal User Flow (Website + API)

### A) Website flow (human operator / analyst)

1. Land on homepage: `https://ahackaday-intel.vercel.app`
2. Scan "Your Security Digest" and newest incident cards.
3. Apply filters (severity, window, category, search) to reduce noise.
4. Open incident detail page for impact + action context.
5. Use Toolkit to open `Slack integration` or `Cantina`.
6. Follow updates via RSS (`/feed.xml`) and return for fresh digest updates.

### B) API flow (automation / Slack bot / agent)

1. Call `/api/v1/health` as readiness gate.
2. Pull filtered incident list from `/api/v1/incidents`.
3. Enrich selected items via `/api/v1/incidents/:slug`.
4. Pull macro signal from `/api/v1/stats`.
5. Respect `429` and `Retry-After` for rate limiting.

### C) Suggested cadence

- Human triage: daily + incident spikes
- Bot polling: every 5-15 minutes
- Leadership snapshot: daily stats

---

## 2) Shoot-Ready Handoff Script

## Runtime

3-5 minutes

## Opening

"AHackaday is our incident intelligence surface. Humans use the website for triage, and integrations use the v1 API for automation."

## Website demo (about 90s)

1. Open homepage: `https://ahackaday-intel.vercel.app`
2. Narrate:
   - "Live digest of major cyber incidents."
   - "Top section is quick pulse; cards show severity/exploit context."
3. Apply filters:
   - severity
   - window
   - optional keyword search
4. Open one incident detail page.
5. Narrate:
   - "Detail view shows summary, why-care, action items."
   - "Canonical link is ready for Slack/war room sharing."
6. Open Toolkit drawer and point to Slack integration link.

## API demo (about 120s)

```bash
# Health
curl -sS "https://ahackaday-intel.vercel.app/api/v1/health" | jq

# Stats snapshot
curl -sS "https://ahackaday-intel.vercel.app/api/v1/stats" | jq

# List incidents (critical)
curl -sS "https://ahackaday-intel.vercel.app/api/v1/incidents?severity=critical&window=all&limit=5" | jq
```

Narration:
- "Health is the readiness gate."
- "Stats is macro signal."
- "Incidents endpoint is filterable and paginated."

Continue:

```bash
# Pull one slug and request detail
SLUG=$(curl -sS "https://ahackaday-intel.vercel.app/api/v1/incidents?limit=1" | jq -r '.items[0].slug')
curl -sS "https://ahackaday-intel.vercel.app/api/v1/incidents/$SLUG" | jq
```

Narration:
- "List returns candidates; detail returns full payload for Slack/bots."

Pagination:

```bash
FIRST=$(curl -sS "https://ahackaday-intel.vercel.app/api/v1/incidents?limit=2")
CURSOR=$(echo "$FIRST" | jq -r '.next_cursor')
curl -sS "https://ahackaday-intel.vercel.app/api/v1/incidents?limit=2&cursor=$CURSOR" | jq
```

Narration:
- "Cursor pagination supports reliable polling jobs."

## Reliability and guardrails (30s)

- Read-only v1 API
- Stable versioned schema (`/api/v1`)
- Cache + rate limits enabled
- Clients should handle `429` + `Retry-After`

Optional 404 demo:

```bash
curl -sS -i "https://ahackaday-intel.vercel.app/api/v1/incidents/does-not-exist"
```

## Close

"Website is optimized for human triage. API is optimized for integrations. One source of truth supports both."
