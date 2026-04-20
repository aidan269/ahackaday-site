---
title: "Browser Zero-Day Used Through Ad-Tech Supply Chain"
date: "2026-04-07"
severity: "high"
affected: "Enterprise browsers exposed to compromised ad exchanges"
summary: "A sandbox escape zero-day was delivered through malicious ad redirects on legitimate sites. Several SOCs observed drive-by payload staging without user interaction."
category: "zero-day"
mitigationStatus: "Browser patch shipped; ad network cleanup in progress"
sources:
  - "https://example.com/browser/advisory"
  - "https://example.com/threat-intel/adtech-chain"
---
## What happened
Compromised ad inventory triggered hidden iframes that fingerprinted systems and delivered exploit chains.

## Why this matters beyond one victim
Ad-tech is shared infrastructure. One poisoned node can impact many unrelated publishers and enterprises.

## Technical notes
Exploit telemetry linked to a mature broker ecosystem and short-lived payload URLs.
