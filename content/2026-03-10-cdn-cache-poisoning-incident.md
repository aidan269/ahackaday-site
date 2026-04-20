---
title: "CDN Cache Poisoning Incident Alters Script Delivery"
date: "2026-03-10"
severity: "high"
affected: "Web apps serving shared JavaScript bundles via CDN"
summary: "Cache key confusion in a CDN edge path enabled temporary script poisoning for some routes. Affected pages loaded credential-harvesting JavaScript before purge."
category: "web"
mitigationStatus: "Purge complete; cache key safeguards added"
sources:
  - "https://example.com/cdn/postmortem"
  - "https://example.com/websec/cache-poisoning-case"
---
## What happened
An edge caching rule mismatch allowed attacker-controlled responses to be served across tenants.

## Why this matters beyond one victim
CDNs are central distribution layers. Misconfiguration can fan out malicious content at internet scale.

## Technical notes
Strict origin response headers and signed asset pipelines helped detect and contain impact faster.
