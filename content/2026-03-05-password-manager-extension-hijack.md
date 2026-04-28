---
title: "Password Manager Extension Hijack in Browser Store"
date: "2026-03-05"
severity: "high"
affected: "Users of a popular browser password manager extension"
summary: "A malicious extension update briefly reached the official browser store and attempted vault credential interception. Rapid takedown limited spread but not initial installs."
category: "consumer-security"
mitigationStatus: "Compromised version removed; forced update and key rotation advised"
socialMentions24h: 640
socialTrend: "up"
socialSummary: "Conversation is rising as teams compare mitigations and vendor guidance."
sources:
  - "https://example.com/store/security-notice"
  - "https://example.com/research/extension-hijack"
---
## What happened
An attacker gained access to the extension publishing workflow and pushed a trojanized build.

## Why this matters beyond one victim
Browser extension ecosystems have high trust and broad user bases, making compromise disproportionately impactful.

## Technical notes
Payload logic targeted autofill events and attempted outbound data transfer on specific banking domains.
