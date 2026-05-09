import type { IncidentEvidence } from "./incident-types";

/**
 * Label used in question-shaped subheadings (CVE preferred, else short product/title fragment).
 */
export function deriveVulnLabel(input: {
  title: string;
  evidence: IncidentEvidence;
  cve?: string | null;
}): string {
  const cve = input.cve?.trim() || input.evidence.cves[0]?.trim();
  if (cve) return cve;
  const title = input.title.trim();
  const beforeVerb = title.split(/\s+(?:discloses?|confirms?|reports?|warns?|hits?|addresses?)\b/i)[0]?.trim();
  if (beforeVerb && beforeVerb.length >= 3 && beforeVerb.length <= 80) return beforeVerb;
  const colon = title.split(":")[0]?.trim();
  if (colon && colon.length >= 3 && colon.length <= 80) return colon;
  return title.length > 72 ? `${title.slice(0, 69)}…` : title;
}
