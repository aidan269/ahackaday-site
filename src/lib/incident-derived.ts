/** Heuristic CVSS score mention from advisory text. */
export function deriveCvssScore(text: string): string | null {
  const m = text.match(/(?:CVSS\s*(?:v?3)?\s*[:)]?\s*)([0-9](?:\.[0-9])?)/i);
  return m?.[1]?.trim() ?? null;
}

/** Heuristic patched-in line from advisory text. */
export function derivePatchedIn(text: string): string | null {
  const patterns = [
    /(?:patched in|fixed in|resolved in|addressed in)\s+([^.;\n]{3,120})/i,
    /(?:upgrade to|update to)\s+([^.;\n]{3,80})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

export function deriveMitigationStatusFromSignals(raw: string, summary: string): string {
  const t = `${raw}\n${summary}`.toLowerCase();
  if (/patch available|vendor patch|security update released|fixed in version/i.test(t)) {
    return "Patch available — prioritize vendor updates.";
  }
  if (/no patch|unpatched|no fix yet|under investigation/i.test(t)) {
    return "No full patch confirmed — monitor vendor guidance.";
  }
  if (/workaround|mitigation|compensating control/i.test(t)) {
    return "Mitigations or workarounds available — validate in your stack.";
  }
  return "Monitoring updates";
}
