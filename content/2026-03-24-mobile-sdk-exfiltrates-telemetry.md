---
title: "Compromised Mobile SDK Exfiltrates App Telemetry"
date: "2026-03-24"
severity: "high"
affected: "Consumer and fintech apps embedding analytics SDK"
summary: "A compromised mobile analytics SDK version exfiltrated sensitive telemetry fields to attacker infrastructure. Multiple app publishers shipped the affected update."
category: "supply-chain"
mitigationStatus: "Clean SDK release available; app update rollout required"
sources:
  - "https://example.com/mobile-sdk/incident"
  - "https://example.com/appsec/reverse-analysis"
---
## What happened
Malicious code was inserted into a signed SDK artifact and propagated via normal dependency upgrades.

## Why this matters beyond one victim
Third-party SDKs create shared risk in mobile ecosystems where users update apps asynchronously.

## Technical notes
Observed data included device IDs, coarse location hints, and session metadata.
