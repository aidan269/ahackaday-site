# AHackaday 60-Second Handoff

## Website flow

1. Open `https://ahackaday-intel.vercel.app`
2. Show digest + filter controls (severity/window/search)
3. Open one incident detail page
4. Show Toolkit -> Slack integration link

## API flow

```bash
curl -sS "https://ahackaday-intel.vercel.app/api/v1/health" | jq
curl -sS "https://ahackaday-intel.vercel.app/api/v1/stats" | jq
curl -sS "https://ahackaday-intel.vercel.app/api/v1/incidents?severity=critical&window=all&limit=5" | jq
```

```bash
SLUG=$(curl -sS "https://ahackaday-intel.vercel.app/api/v1/incidents?limit=1" | jq -r '.items[0].slug')
curl -sS "https://ahackaday-intel.vercel.app/api/v1/incidents/$SLUG" | jq
```

## One-liner close

AHackaday is optimized for fast human triage on the site and clean automation via a read-only v1 API.
