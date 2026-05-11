import { getPublicSiteUrl } from "@/lib/ecosystem";
import type { Incident } from "@/lib/incidents";
import { getIncidentBySourceRowId } from "@/lib/incidents";

function normKey(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function uniqCves(ids: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const u = (id ?? "").trim();
    if (!u) continue;
    const k = u.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(u);
  }
  return out;
}

/**
 * Flat text sent to the AEO scorer. Order matters: put lead + structured facts
 * before the long body so the model sees citable anchors (CVEs, packages, IOCs)
 * even when on-page prose is generic.
 */
export function buildIncidentPageTextForScoring(incident: Incident): string {
  const body =
    typeof incident.content === "string"
      ? incident.content
      : Array.isArray(incident.content)
        ? incident.content.map((s) => `${s.h}\n${s.p}`).join("\n\n")
        : "";

  const summary = incident.summary.trim();
  const tldr = (incident.tldr ?? "").trim();
  const includeTldr = Boolean(tldr && normKey(tldr) !== normKey(summary));

  const cves = uniqCves([...(incident.evidence?.cves ?? []), incident.cve]);
  const packages = (incident.evidence?.packages ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 12);
  const versions = (incident.evidence?.versions ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 8);
  const systems = (incident.evidence?.systems ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 8);
  const dates = (incident.evidence?.dates ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 6);

  const rwi = (incident.realWorldImpact ?? "").trim();
  const wc = (incident.whyCare ?? "").trim();
  const includeRwi = Boolean(rwi && normKey(rwi) !== normKey(summary));
  const includeWc = Boolean(
    wc && normKey(wc) !== normKey(summary) && (!includeRwi || normKey(wc) !== normKey(rwi)),
  );

  const lines: string[] = [];
  lines.push("=== Incident page (bundle for AEO scoring; mirrors public fields) ===");
  lines.push("");
  lines.push(`Title: ${incident.title}`);
  lines.push(`Published: ${incident.date.slice(0, 10)}`);
  lines.push(`Severity: ${incident.severity}`);
  lines.push("");
  lines.push("--- Lead ---");
  lines.push(`Summary: ${summary}`);
  if (includeTldr) lines.push(`TL;DR: ${tldr}`);
  lines.push("");
  lines.push("--- Structured facts ---");
  lines.push(`Category: ${incident.category}`);
  lines.push(`Affected: ${incident.affected}`);
  lines.push(`Mitigation status: ${incident.mitigationStatus}`);
  lines.push(`CVEs: ${cves.length ? cves.join(", ") : "n/a"}`);
  lines.push(`CVSS (parsed): ${incident.cvssScore ?? "—"}`);
  lines.push(`Patched in: ${incident.patchedIn ?? "—"}`);
  lines.push(`Exploited in the wild (signal): ${incident.exploited ? "yes" : "no"}`);
  if (packages.length) lines.push(`Evidence packages: ${packages.join("; ")}`);
  if (versions.length) lines.push(`Evidence versions: ${versions.join("; ")}`);
  if (systems.length) lines.push(`Evidence systems: ${systems.join("; ")}`);
  if (dates.length) lines.push(`Evidence dates: ${dates.join("; ")}`);

  if (includeRwi || includeWc) {
    lines.push("");
    lines.push("--- Editorial framing ---");
    if (includeRwi) lines.push(`Real-world impact:\n${truncate(rwi, 900)}`);
    if (includeWc) lines.push(`Why this matters:\n${truncate(wc, 900)}`);
  }

  const actions = (incident.actionItems ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 8);
  if (actions.length) {
    lines.push("");
    lines.push("--- Action items ---");
    actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  }

  const iocs = (incident.iocs ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 24);
  if (iocs.length) {
    lines.push("");
    lines.push("--- IOCs / indicators ---");
    for (const row of iocs) lines.push(`- ${truncate(row, 240)}`);
  }

  const amb = (incident.ambiguities ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 6);
  if (amb.length) {
    lines.push("");
    lines.push("--- Known ambiguities ---");
    amb.forEach((a) => lines.push(`- ${truncate(a, 320)}`));
  }

  lines.push("");
  lines.push("--- Full article body ---");
  lines.push(body.trim() || "(empty body)");
  lines.push("");
  lines.push(`Sources: ${incident.sources.join(", ")}`);

  return lines.join("\n");
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
