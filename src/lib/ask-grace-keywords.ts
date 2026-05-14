import type { Incident } from "@/lib/incident-types";

const STOP = new Set(
  `the a an and or for to of in on at by with from as is was are were be been
this that it its has have had not no may can could would will should about into
through before after all each both few more most other some such only same so
than too very just but also out our your their what which who whom new any
incident incidents security vulnerability data users update issue report
blog post open source days day week year get got make made like said says via
per over based high low key risk being still known https http www com org net
one two infosec brief summary details information according reports sources page
text body field fields lacks missing absent`.split(/\s+/),
);

/** High-frequency English that matches almost every social post when used case-insensitively. */
const GENERIC_NOISE = new Set(
  `
environment response whether matters affect window windows software updates systems human
path stack check exist why client server file files link links page public private general
specific common likely small large local remote global internal external entire whole
third first second without within using under above across around another others those
these between during empty error false true clear close later early again might must
need seem seen given taken shown added related different important usually actually
several various available following include excludes thought example sample simply
completely absolutely nothing something anything somewhere anywhere everyone someone
anyone already always never sometimes perhaps maybe instead however although though
unless until while where here there then once twice often seldom recently finally
initially currently previously directly indirectly quickly slowly easily hardly nearly
mostly partly fully simply basically essentially generally specifically
typically obviously clearly apparently naturally necessarily theoretically practically
actually virtually literally seriously heavily lightly strongly weakly widely narrowly
deeply barely mainly partly fully`.split(/\s+/),
);

/** Short lowercase security / tech tokens to keep even when generic filters apply. */
const SECURITY_SHORT_OK = new Set(
  `npm api aws cve dns dos gcp iam ioc iot mfa mit otp poc rat s3 sam smb sql ssh sso tcp tls udp vpn vpc waf xss csrf ssrf apt gh pypi mvn c2 ip os ui ux id`.split(
    /\s+/,
  ),
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

/** Proper nouns, CVEs, package-like ids, acronyms — worth keeping for social search. */
function hasSignalShape(t: string): boolean {
  if (/^CVE-\d{4}-\d+$/i.test(t)) return true;
  if (/\d/.test(t)) return true;
  if (/[.@/+#_-]/.test(t)) return true;
  if (/^[A-Z]{2,6}$/.test(t)) return true;
  if (t !== t.toLowerCase() && /[A-Z]/.test(t) && /[a-z]/.test(t)) return true;
  if (/^[A-Z][a-z]{3,}$/.test(t)) return true;
  return false;
}

function addProtectedLower(s: Set<string>, raw: string) {
  const t = raw.trim().toLowerCase();
  if (t.length < 2) return;
  s.add(t);
  for (const seg of t.split(/[^a-z0-9]+/i)) {
    if (seg.length >= 3) s.add(seg.toLowerCase());
  }
}

/** Terms sourced from structured fields — do not drop as generic noise. */
function buildProtectedLower(incident: Incident): Set<string> {
  const p = new Set<string>();
  for (const c of incident.evidence?.cves ?? []) addProtectedLower(p, c);
  if (incident.cve) addProtectedLower(p, incident.cve);
  for (const pkg of incident.evidence?.packages ?? []) addProtectedLower(p, pkg);
  for (const sys of incident.evidence?.systems ?? []) addProtectedLower(p, sys);
  for (const ioc of incident.iocs ?? []) addProtectedLower(p, ioc);
  for (const kw of incident.socialKeywords ?? []) addProtectedLower(p, kw);
  for (const term of incident.xTopTerms ?? []) addProtectedLower(p, term);
  for (const tag of incident.xTopHashtags ?? []) {
    addProtectedLower(p, tag.startsWith("#") ? tag.slice(1) : tag);
  }
  if (incident.category) addProtectedLower(p, incident.category);
  for (const part of incident.slug.split(/[-_]+/)) addProtectedLower(p, part);
  return p;
}

function keepKeywordForGrace(t: string, protectedLower: Set<string>): boolean {
  const lower = t.toLowerCase();
  if (/^CVE-\d{4}-\d+$/i.test(t)) return true;
  if (hasSignalShape(t)) return true;
  if (protectedLower.has(lower)) return true;
  if (SECURITY_SHORT_OK.has(lower)) return true;
  if (GENERIC_NOISE.has(lower)) return false;
  if (STOP.has(lower)) return false;
  if (/^[a-z]{3,5}$/.test(t) && !SECURITY_SHORT_OK.has(lower)) return false;
  return true;
}

/**
 * Heuristic keywords from the incident brief for Ask Grace (search / monitoring / prompts).
 * Drops common English that creates noisy social/RSS matches; keeps CVEs, structured
 * fields, proper-noun-shaped tokens, and longer substantive lowercase terms.
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

  const protectedLower = buildProtectedLower(incident);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    if (!keepKeywordForGrace(t, protectedLower)) continue;
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
