---
title: "Typosquatted NPM Package Backdoors Build Pipelines"
date: "2026-04-16"
severity: "high"
affected: "JavaScript CI pipelines and internal package mirrors"
summary: "A typosquatted package reached thousands of installs and executed a postinstall backdoor. CI runners leaked environment tokens and private registry credentials."
category: "supply-chain"
mitigationStatus: "Package removed; token rotation and audit ongoing"
socialMentions24h: 640
socialTrend: "up"
socialSummary: "Conversation is rising as teams compare mitigations and vendor guidance."
sources:
  - "https://example.com/blog/npm-typosquat"
  - "https://example.com/cert/supply-chain-alert"
---
## What happened
The malicious dependency used a convincing name variation and appeared in copied snippets and AI-generated code.

## Why this matters beyond one victim
Build systems are high-leverage targets. A single poisoned package can contaminate many downstream artifacts.

## Technical notes
The script exfiltrated env vars over HTTPS and attempted to persist via modified lockfiles.
