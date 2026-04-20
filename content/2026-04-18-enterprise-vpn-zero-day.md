---
title: "Enterprise VPN Zero-Day Hits Multiple Sectors"
date: "2026-04-18"
severity: "critical"
affected: "Edge VPN gateways in finance, healthcare, and logistics"
summary: "A pre-auth remote code execution bug in a widely deployed VPN appliance is under active exploitation. Internet-facing gateways were compromised in hours, with follow-on credential theft."
category: "zero-day"
mitigationStatus: "Emergency patch released; compensating controls still needed"
sources:
  - "https://example.com/advisory/vpn-rce"
  - "https://example.com/research/vpn-exploitation"
---
## What happened
Attackers exploited a memory corruption flaw reachable without authentication. Public scanning showed broad exposure and rapid exploitation.

## Why this matters beyond one victim
Shared infrastructure vendors mean one bug crosses industries quickly. Attack chains now pivot from perimeter devices into identity systems.

## Technical notes
Observed payloads dropped webshells and harvested local config secrets, then attempted LDAP and SSO token replay.
