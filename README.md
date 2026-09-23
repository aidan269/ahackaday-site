# AHackaday

> **Archived project:** The AHackaday site is no longer running. This repository is retained as a reference for the original application layout, API design, and data-flow skeleton.

AHackaday was a Next.js prototype for browsing and summarizing cybersecurity incidents. The project combined an incident-focused web interface with a small read-only API and a scheduled social-metrics refresh process.

The original deployment was hosted at `ahackaday-intel.vercel.app`, but it should be considered offline. The code remains available for reference, experimentation, or reuse.

## Original application skeleton

At a high level, the project was organized around four pieces:

1. **Web interface** — a Next.js application for viewing and filtering security incidents.
2. **Incident API** — read-only endpoints for incident lists, individual records, aggregate statistics, and service health.
3. **Data storage** — Supabase-backed application data, including incident social metrics.
4. **Scheduled refresh** — an authenticated endpoint that refreshed external social metrics, with optional GitHub API access.

```text
Browser
  |
  v
Next.js application
  |-- incident pages and filters
  |-- /api/v1/incidents
  |-- /api/v1/incidents/[slug]
  |-- /api/v1/stats
  |-- /api/v1/health
  `-- /api/social/refresh
           |
           v
        Supabase
```

## API outline

The original read-only API was exposed under `/api/v1`:

- `GET /api/v1/incidents`
- `GET /api/v1/incidents/[slug]`
- `GET /api/v1/stats`
- `GET /api/v1/health`

The incident-list endpoint supported:

- `severity`: `critical | high | medium | low | all`
- `category`: `zero-day | supply-chain | breach | ransomware | identity | cloud | web | email | critical-infrastructure | exploitation | consumer-security | other | all`
- `window`: `7d | 30d | 90d | all`
- `q`: free-text search
- `limit`: up to 100, with a default of 25
- `cursor`: opaque pagination cursor returned by the preceding request

These routes document the former interface only; the hosted endpoints are no longer expected to respond.

## Social-metrics refresh

The prototype stored social metrics in the Supabase `incident_social_metrics` table and included an authenticated refresh route:

- `POST /api/social/refresh`
- `GET /api/social/refresh?limit=60`

The refresh flow expected the following environment variables:

- `CRON_SECRET` — bearer token used to protect the refresh endpoint
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — server-side credential used for writes
- `GITHUB_TOKEN` — optional token for increased GitHub API limits

Do not reuse credentials from the former deployment. Create new, restricted credentials if you adapt the project.

## Running the skeleton locally

The repository was created with Next.js. If its dependencies and external services remain compatible, the basic development flow is:

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`. The primary page entry point is `app/page.tsx`.

Because the project is archived, local setup may require dependency updates, new Supabase configuration, and replacement data sources. No active deployment or ongoing maintenance is implied.

## Historical note

The project was previously shared by Cantina Security: [view the original post](https://x.com/cantinasecurity/status/2051291349757165785).

