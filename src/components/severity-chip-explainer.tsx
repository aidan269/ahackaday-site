"use client";

import type { CSSProperties } from "react";

const SEV_COLOR = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
} as const;

type SeverityKey = keyof typeof SEV_COLOR;

export function SeverityChipExplainer({
  severity,
  rationale,
}: {
  severity: SeverityKey;
  rationale: string[];
}) {
  const sev = SEV_COLOR[severity];
  const tip = rationale.length
    ? [`Severity uplift rationale (${severity}):`, ...rationale.map((r) => `• ${r}`)].join("\n")
    : `Severity is ${severity} (no additional auto-uplift signals beyond briefing/base).`;

  return (
    <span
      className={`sev-chip sev-chip--tip sev-${severity}`}
      style={{ ["--sev" as string]: sev } as CSSProperties}
      title={tip}
    >
      {severity}
      <span className="sev-chip__hint" aria-hidden>
        ?
      </span>
    </span>
  );
}
