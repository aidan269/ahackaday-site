import { getPublicSiteUrl } from "@/lib/ecosystem";
import type { Incident } from "@/lib/incidents";
import { getIncidentBySourceRowId } from "@/lib/incidents";

export function buildIncidentPageTextForScoring(incident: Incident): string {
  const body =
    typeof incident.content === "string"
      ? incident.content
      : Array.isArray(incident.content)
        ? incident.content.map((s) => `${s.h}\n${s.p}`).join("\n\n")
        : "";
  const parts = [
    `Title: ${incident.title}`,
    `Summary: ${incident.summary}`,
    `Affected: ${incident.affected}`,
    `Mitigation: ${incident.mitigationStatus}`,
    `Category: ${incident.category}`,
    `CVE: ${incident.cve ?? incident.evidence.cves[0] ?? "n/a"}`,
    `CVSS: ${incident.cvssScore ?? "—"}`,
    `Patched in: ${incident.patchedIn ?? "—"}`,
    `Exploited in wild: ${incident.exploited ? "yes" : "no"}`,
    `Body:\n${body}`,
    `Sources: ${incident.sources.join(", ")}`,
  ];
  return parts.join("\n\n");
}

export async function fetchIncidentContent(incidentId: string): Promise<{
  id: string;
  slug: string;
  url: string;
  content: string;
} | null> {
  const incident = await getIncidentBySourceRowId(incidentId);
  if (!incident) return null;
  const url = `${getPublicSiteUrl()}/incident/${incident.slug}`;
  return {
    id: incidentId,
    slug: incident.slug,
    url,
    content: buildIncidentPageTextForScoring(incident),
  };
}
