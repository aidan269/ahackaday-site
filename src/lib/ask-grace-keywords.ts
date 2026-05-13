import type { Incident } from "@/lib/incident-types";

const STOP = new Set(
  `the a an and or for to of in on at by with from as is was are were be been
this that it its has have had not no may can could would will should about into
through before after all each both few more most other some such only same so
than too very just but also out our your their what which who whom new any
incident incidents security attack vulnerability data users update issue report
blog post open source days day week year get got make made like said says via
per over based high low key risk being still known https http www com org net
one two infosec brief summary details information according reports sources page
text body field fields lacks missing absent`.split(/\s+/),
);

const CVE_RE = /CVE-\d{4}-\d+/gi;

function flattenContent(incident: Incident): string {
  if (typeof incident.content === "string") return incident.content;
  return incident.content.map((b) => `${b.h} ${b.p}`).join("\n");
}

function tokenize(blob: string): string[] {
  const cves = [...blob.matchAll(CVE_RE)].map((m) => m[0].toUpperCase());
  const stripped = blob.replace(CVE_RE, " ");
  const words = stripped
    .split(/[^a-zA-Z0-9#+/._-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && w.length <= 42);
  const filtered = words
    .map((w) => (w.startsWith("#") ? w.slice(1) : w))
    .filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
  return [...cves, ...filtered];
}

/**
 * Heuristic keywords from the incident brief for Ask Grace (search / monitoring / prompts).
 * Deduped, CVEs first, then longer tokens; max ~48 items.
 */
export function extractIncidentKeywordsForGrace(incident: Incident): string[] {
  const chunks: string[] = [
    incident.title,
    incident.summary,
    incident.tldr,
    incident.category,
    incident.affected,
    incident.mitigationStatus,
    incident.realWorldImpact?.slice(0, 400) ?? "",
    incident.whyCare?.slice(0, 400) ?? "",
    flattenContent(incident).slice(0, 2500),
    ...(incident.evidence?.cves ?? []),
    ...(incident.evidence?.packages ?? []).slice(0, 16),
    ...(incident.evidence?.systems ?? []).slice(0, 8),
    incident.cve ?? "",
    ...(incident.iocs ?? []).slice(0, 6).map((s) => s.slice(0, 120)),
  ];
  if (incident.socialKeywords?.length) {
    chunks.push(incident.socialKeywords.slice(0, 12).join(" "));
  }
  if (incident.xTopTerms?.length) {
    chunks.push(incident.xTopTerms.slice(0, 12).join(" "));
  }
  if (incident.xTopHashtags?.length) {
    chunks.push(incident.xTopHashtags.map((h) => (h.startsWith("#") ? h.slice(1) : h)).join(" "));
  }

  const raw: string[] = [];
  for (const c of chunks) {
    if (c?.trim()) raw.push(...tokenize(c));
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(/^CVE-\d{4}-\d+$/i.test(t) ? t.toUpperCase() : t);
  }

  out.sort((a, b) => {
    const ac = /^CVE-/i.test(a) ? 2 : 0;
    const bc = /^CVE-/i.test(b) ? 2 : 0;
    if (ac !== bc) return bc - ac;
    return b.length - a.length;
  });

  return out.slice(0, 48);
}
