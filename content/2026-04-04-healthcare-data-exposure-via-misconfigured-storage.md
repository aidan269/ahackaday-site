---
title: "Healthcare Data Exposure via Misconfigured Object Storage"
date: "2026-04-04"
severity: "high"
affected: "Patient records synced by third-party billing processors"
summary: "Open cloud storage buckets exposed patient intake and billing records for multiple healthcare groups. Data appears indexed by public scanners before takedown."
category: "breach"
mitigationStatus: "Buckets locked down; notification obligations underway"
sources:
  - "https://example.com/news/healthcare-bucket-exposure"
  - "https://example.com/regulator/breach-notice"
---
## What happened
A shared integration workflow pushed files to public-read buckets with predictable naming conventions.

## Why this matters beyond one victim
Many smaller providers inherit risk from common vendors and cloud templates they did not create.

## Technical notes
Leak content included PDFs, CSV exports, and metadata files containing account identifiers.
