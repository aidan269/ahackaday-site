# Grace IOC + Rules Product Spec

## TL;DR
Build Grace as the operational layer for AHackaday incident workflows:
- Extract and normalize IOCs from incident URLs/content
- Generate starter detection rules (Sigma, YARA, KQL/SPL)
- Export IOC/rule bundles
- Persist case artifacts per incident URL/thread

This keeps AHackaday focused on discovery/community, while Grace handles analyst execution.

---

## Product Goals

### Primary goals
- Reduce time from "incident discovered" to "IOC/rules in tooling"
- Make exports copy/paste ready for SecOps workflows
- Provide repeatable, auditable outputs tied to source URLs

### Non-goals (v1)
- Fully autonomous threat hunting
- Production-grade rule tuning per customer environment
- Full TIP/SIEM bidirectional integrations (future phase)

---

## User Personas

- SOC analyst: needs fast IOC extraction and starter detections
- Detection engineer: wants structured output and editable rule templates
- IR lead: needs traceability and easy sharing of findings

---

## Core User Stories

1. As an analyst, I can open an incident URL in Grace and get typed IOCs quickly.
2. As a detection engineer, I can generate Sigma/YARA/KQL/SPL starter rules in one click.
3. As an IR lead, I can export artifacts and share/restore case state later.
4. As a user, I can see confidence and provenance so I know what to trust.

---

## Scope (v1)

## 1) IOC Workbench

### Inputs
- Incident URL (from AHackaday deep link)
- Optional pasted text/content

### Processing
- Fetch page content (or receive context payload)
- Extract candidates via parser + LLM assist
- Normalize and classify IOC types:
  - cve
  - ip
  - domain
  - url
  - hash (md5/sha1/sha256)
  - package/module
  - registry key/file path/other (fallback)
- Deduplicate and score confidence

### Outputs
- IOC table (type, value, confidence, source span/snippet)
- Filters by IOC type
- Actions:
  - Copy all
  - Copy by type
  - Export TXT
  - Export JSON

## 2) Rule Studio

### Formats
- Sigma (YAML)
- YARA
- KQL
- SPL

### Rule generation behavior
- Generate "starter" rules from extracted IOC set + incident context
- Include metadata:
  - title
  - description
  - source URL
  - generated timestamp
  - severity/confidence hint

### UX actions
- Tabbed code blocks by rule format
- Copy button per tab
- Download rule pack (zip optional in v1.1)
- "Tuning hints" panel with caveats

## 3) Export Pack

### v1 formats
- `iocs.txt`
- `iocs.json`
- `rules-sigma.yml`
- `rules-yara.yar`
- `rules-kql.txt`
- `rules-spl.txt`

### Optional metadata file
- `manifest.json` with:
  - source URL
  - case/thread ID
  - generated_at
  - model/version
  - counts by IOC type

## 4) Case Memory

Persist per `case_id` (or per source URL + user):
- selected IOCs
- generated rules
- analyst notes
- timestamps + revision history (minimal)

v1 can be simple "latest snapshot", with revisions in v1.1.

---

## System Architecture (v1)

## Entry point
- AHackaday "Open in Grace" deep link provides URL context.

## Grace services
- `content-fetch` module (URL fetch + extraction)
- `ioc-extract` module (regex + parser + LLM normalization)
- `rule-generate` module (template + model-assisted generation)
- `artifact-export` module (text/json serialization)
- `case-store` module (DB persistence)

## Suggested data model

### `cases`
- `id`
- `user_id`
- `source_url`
- `title`
- `created_at`
- `updated_at`

### `case_iocs`
- `id`
- `case_id`
- `ioc_type`
- `value`
- `confidence` (0-1)
- `source_excerpt`
- `created_at`

### `case_rules`
- `id`
- `case_id`
- `rule_type` (sigma|yara|kql|spl)
- `content`
- `version`
- `created_at`

### `case_notes`
- `id`
- `case_id`
- `body`
- `created_at`

---

## API Contracts (v1)

## `POST /api/cases/from-url`
Create or load a case from URL and run IOC extraction.

Request:
```json
{
  "url": "https://www.ahackaday.news/incident/...",
  "refresh": false
}
```

Response:
```json
{
  "ok": true,
  "case": {
    "id": "case_123",
    "source_url": "https://...",
    "title": "Incident title"
  },
  "iocs": [
    { "id": "ioc_1", "type": "cve", "value": "CVE-2026-12345", "confidence": 0.98 }
  ],
  "stats": { "total": 24, "by_type": { "cve": 2, "domain": 4 } }
}
```

## `POST /api/cases/{caseId}/rules:generate`
Generate starter rules from selected IOCs/context.

Request:
```json
{
  "formats": ["sigma", "yara", "kql", "spl"],
  "ioc_ids": ["ioc_1", "ioc_2"]
}
```

Response:
```json
{
  "ok": true,
  "rules": {
    "sigma": "...",
    "yara": "...",
    "kql": "...",
    "spl": "..."
  }
}
```

## `GET /api/cases/{caseId}/export?format=txt|json|bundle`
Return export artifacts for download.

## `PATCH /api/cases/{caseId}`
Update selected IOCs, notes, or metadata.

---

## UI/UX States

## Main states
- Idle (await URL)
- Loading extraction
- Ready (IOCs + rule tabs)
- Empty (no IOC found)
- Error (fetch/extract failure)

## Key components
- URL header + case metadata
- IOC table with:
  - type chips
  - confidence indicator
  - select checkboxes
- Rule Studio tabs
- Export actions
- Notes panel

## UX constraints
- Preserve user selections when regenerating rules
- Never silently overwrite edited rules without warning
- Always show source URL and generation timestamp

---

## Security & Trust Requirements

- Require authenticated user for case persistence
- Sanitize fetched HTML and untrusted content
- Store source snippets for explainability
- Show "starter rule" disclaimer by default
- Log generation provenance (model + prompt template version)

---

## Metrics / Success Criteria

## Activation
- % of opened incidents that result in IOC extraction
- % of sessions generating >=1 rule

## Workflow value
- Median time from load to first export
- Copy/download actions per case
- Return usage on same case (memory usefulness)

## Quality
- User thumbs-up/down on extracted IOC relevance
- Rule acceptance rate after analyst edits (manual metric)

---

## Implementation Plan (Engineering Slices)

## Slice 1 (must-have)
- IOC extraction pipeline + IOC table
- Case creation from URL
- Copy/export IOC txt/json

## Slice 2
- Rule generation tabs (Sigma/YARA/KQL/SPL)
- Copy/export rules
- Starter-rule disclaimer + tuning hints

## Slice 3
- Case memory (save/reopen latest)
- Notes persistence
- Basic revision metadata

---

## Acceptance Criteria (v1)

- Opening an AHackaday URL in Grace creates/loads a case successfully.
- IOC table renders typed, deduplicated indicators with confidence.
- User can copy/export IOCs in txt/json.
- User can generate and copy Sigma/YARA/KQL/SPL rules.
- User can save and revisit case artifacts (IOCs/rules/notes).
- All outputs include source URL and generated timestamp metadata.

---

## Risks & Mitigations

- False positives in IOC extraction
  - Mitigate with confidence score + quick delete/select controls
- Over-trust in generated rules
  - Mitigate with visible disclaimers + tuning notes
- Content fetch failures (paywalls, blocked pages)
  - Mitigate by accepting pasted text and fallback extraction path

---

## Future (v1.1+)

- STIX 2.1 / MISP export
- MITRE ATT&CK tactic/technique tagging
- Integrations (Elastic/Splunk/Sentinel push)
- Collaborative case comments and assignment
- Rule quality feedback loop for automatic prompt/template improvement
