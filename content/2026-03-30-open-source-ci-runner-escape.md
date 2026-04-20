---
title: "Open-Source CI Runner Escape Enables Secret Theft"
date: "2026-03-30"
severity: "high"
affected: "Self-hosted CI runners across software organizations"
summary: "A container escape in a popular CI runner let untrusted build jobs access host-level secrets. Attackers used it to steal cloud credentials and signing keys."
category: "supply-chain"
mitigationStatus: "Patched runner released; hardening guidance published"
sources:
  - "https://example.com/maintainer/security-bulletin"
  - "https://example.com/research/ci-runner-escape"
---
## What happened
The flaw allowed a crafted job to mount host paths and read secret material from runner storage.

## Why this matters beyond one victim
Compromised CI systems can poison software artifacts distributed to customers and partners.

## Technical notes
Strong isolation and ephemeral runners significantly reduced observed impact in mature environments.
