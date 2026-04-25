import type { Incident } from "@/lib/incidents";

/** Plain-text sections from structured incident fields for Ask AI grounding (after Summary line). */
export function buildIncidentBriefLines(incident: Incident): string[] {
  const lines: string[] = [];
  lines.push("Real-world impact:", incident.realWorldImpact, "");
  lines.push("Why you should care:", incident.whyCare, "");
  if (incident.actionItems.length) {
    lines.push("Action items:");
    for (const a of incident.actionItems) lines.push(`- ${a}`);
    lines.push("");
  }
  if (incident.iocs.length) {
    lines.push("IOCs:");
    for (const ioc of incident.iocs) lines.push(`- ${ioc}`);
    lines.push("");
  }
  if (incident.ambiguities.length) {
    lines.push("Ambiguities:");
    for (const a of incident.ambiguities) lines.push(`- ${a}`);
    lines.push("");
  }
  const body = incident.content?.trim();
  if (body) {
    lines.push("Additional brief / notes:", body);
  }
  return lines;
}

export function primaryTrackingId(incident: Incident): string | null {
  const cve = incident.evidence.cves[0];
  if (cve) return cve;
  const fromTitle = /CVE-\d{4}-\d+/i.exec(incident.title);
  return fromTitle ? fromTitle[0] : null;
}
