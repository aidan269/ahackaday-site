"use client";

import type { CSSProperties } from "react";

import type { Severity } from "@/lib/incident-types";

const SEV_COLOR: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
  unclassified: "var(--sev-unclassified)",
};

export function SeverityChipExplainer({
  severity,
  rationale,
}: {
  severity: Severity;
  rationale: string[];
}) {
  const sev = SEV_COLOR[severity];
  const tip = rationale.length
    ? [`Severity uplift rationale (${severity}):`, ...rationale.map((r) => `• ${r}`)].join("\n")
    : severity === "unclassified"
      ? "Severity not assigned from source metadata — review editorial classification."
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
