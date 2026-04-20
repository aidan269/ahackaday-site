---
title: "Identity Provider Session Hijack Campaign Escalates"
date: "2026-04-02"
severity: "critical"
affected: "SSO tenants with legacy session token policies"
summary: "Attackers are replaying stolen session artifacts to bypass MFA in older SSO tenant configurations. Victims include MSPs, giving attackers downstream customer access."
category: "identity"
mitigationStatus: "Session binding controls available but not default"
sources:
  - "https://example.com/identity/provider-advisory"
  - "https://example.com/ir-lab/session-replay"
---
## What happened
Infostealer logs and browser cookie dumps were traded and operationalized for direct portal access.

## Why this matters beyond one victim
Identity platforms are transitive trust anchors. One compromised admin session can cascade into many environments.

## Technical notes
Successful intrusions often lacked conditional access enforcement tied to device posture and token age.
