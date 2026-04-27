import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";

import type {
  Incident,
  IncidentEvidence,
  IncidentFrontmatter,
  IncidentType,
  Severity,
} from "./incident-types";
import { INCIDENT_TYPE_OPTIONS } from "./incident-types";
import { decodeHtmlEntities, stripInvisibleUnicode } from "./html-entities";

export type { Incident, IncidentEvidence, IncidentFrontmatter, IncidentType, Severity };
export { INCIDENT_TYPE_OPTIONS };
export { formatIncidentDate } from "./format-incident-date";

const CONTENT_DIR = path.join(process.cwd(), "content");
const DATA_SOURCE = process.env.DATA_SOURCE ?? "markdown";

const severityRank: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

type SupabaseIncidentRow = {
  id: string;
  title: string;
  source_url: string;
  source_name: string;
  raw_content: string;
  claude_summary: string;
  severity: Severity;
  published_at: string;
  created_at: string;
};

type StructuredBriefing = {
  tldr: string;
  realWorldImpact: string;
  whyCare: string;
  actionItems: string[];
  iocs: string[];
  evidence: IncidentEvidence;
  ambiguities: string[];
  confidenceScore: number;
  severity?: Severity;
  exploited?: boolean;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function normalizeDisplayText(value: string): string {
  const decoded = stripInvisibleUnicode(decodeHtmlEntities(value));
  return decoded
    .replace(/\[\s*(?:\.\.\.|…)\s*\]/g, "")
    .replace(/(?:\s+[—–-])?\s*\.\.\.\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function trimToCompleteSentence(value: string): string {
  const text = normalizeDisplayText(value);
  if (!text) return text;
  if (/[.!?]["')\]]?$/.test(text)) return text;

  let lastTerminal = -1;
  for (let i = text.length - 1; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === "." || ch === "!" || ch === "?") {
      lastTerminal = i;
      break;
    }
  }
  if (lastTerminal >= 80) {
    return text.slice(0, lastTerminal + 1).trim();
  }
  return text;
}

function createEmptyEvidence(): IncidentEvidence {
  return {
    packages: [],
    versions: [],
    cves: [],
    dates: [],
    systems: [],
  };
}

export function inferExploitedSignal(text: string): boolean {
  return /(actively )?exploited( in the wild)?|under active exploitation|zero-day attacks/i.test(text);
}

function normalizeArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => (typeof value === "string" ? normalizeDisplayText(value) : ""))
    .filter(Boolean);
}

function normalizeEvidence(input: unknown): IncidentEvidence {
  const evidence = (input && typeof input === "object" ? input : {}) as Partial<IncidentEvidence>;
  return {
    packages: normalizeArray(evidence.packages),
    versions: normalizeArray(evidence.versions),
    cves: normalizeArray(evidence.cves),
    dates: normalizeArray(evidence.dates),
    systems: normalizeArray(evidence.systems),
  };
}

function parseStructuredBriefing(value: string): StructuredBriefing | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<StructuredBriefing>;
    if (!parsed.tldr || !parsed.realWorldImpact || !parsed.whyCare) return null;
    return {
      tldr: normalizeDisplayText(parsed.tldr),
      realWorldImpact: normalizeDisplayText(parsed.realWorldImpact),
      whyCare: normalizeDisplayText(parsed.whyCare),
      actionItems: normalizeArray(parsed.actionItems),
      iocs: normalizeArray(parsed.iocs),
      evidence: normalizeEvidence(parsed.evidence),
      ambiguities: normalizeArray(parsed.ambiguities),
      confidenceScore:
        typeof parsed.confidenceScore === "number"
          ? Math.min(1, Math.max(0, parsed.confidenceScore))
          : 0.55,
      severity: parsed.severity,
      exploited: typeof parsed.exploited === "boolean" ? parsed.exploited : undefined,
    };
  } catch {
    return null;
  }
}

function buildSlugFromDb(row: SupabaseIncidentRow): string {
  const datePrefix = new Date(row.published_at).toISOString().slice(0, 10);
  const titleSlug = slugify(row.title);
  const idShort = row.id.slice(0, 8);
  return `${datePrefix}-${titleSlug}-${idShort}`;
}

function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function inferAffectedFromRow(row: SupabaseIncidentRow, summary: string): string {
  const text = `${summary} ${row.raw_content}`.replace(/\s+/g, " ").trim();
  const matchers = [
    /(?:affected?|impacted?|target(?:ed|s|ing)?)\s+([^.;]{12,120})/i,
    /(?:across|in)\s+([^.;]{12,120})/i,
  ];

  for (const matcher of matchers) {
    const hit = text.match(matcher);
    if (hit?.[1]) {
      const candidate = hit[1].replace(/\s+/g, " ").trim();
      // Reject low-signal fragments that read like sentence tails.
      if (
        candidate.length < 8 ||
        candidate.length > 90 ||
        candidate.includes(",") ||
        /^(or|and|to|for|with)\b/i.test(candidate) ||
        /^(a|an|the)\s+/i.test(candidate) ||
        /(in any way|compromised in any way|common complaint|unexpected updates)/i.test(candidate)
      ) {
        continue;
      }
      return normalizeDisplayText(candidate);
    }
  }

  const subjectFromTitle = normalizeDisplayText(row.title)
    .split(/(?:\s+confirms?\b|\s+gets\b|\s+reports?\b|\s+warns?\b|\s+hit\b|:)/i)[0]
    ?.trim();
  if (subjectFromTitle && subjectFromTitle.length >= 3) return subjectFromTitle;
  return normalizeDisplayText(row.title);
}

function dedupeSummaryAgainstTitle(title: string, summary: string): string {
  const normalizedTitle = normalizeDisplayText(title).toLowerCase();
  let cleaned = normalizeDisplayText(summary);
  const lower = cleaned.toLowerCase();
  if (lower.startsWith(normalizedTitle)) {
    cleaned = cleaned.slice(title.length).trim().replace(/^[-:.\s]+/, "");
  }
  return cleaned || normalizeDisplayText(summary);
}

function dedupeBodyAgainstSummary(title: string, summary: string, body: string): string {
  let cleaned = normalizeDisplayText(body);
  const lower = cleaned.toLowerCase();
  const titleLower = normalizeDisplayText(title).toLowerCase();
  const summaryLower = normalizeDisplayText(summary).toLowerCase();

  if (lower.startsWith(titleLower)) {
    cleaned = cleaned.slice(title.length).trim().replace(/^[-:.\s]+/, "");
  }
  if (cleaned.toLowerCase().startsWith(summaryLower)) {
    const trimmed = cleaned.slice(summary.length).trim().replace(/^[-:.\s]+/, "");
    // Guard against accidental mid-sentence truncation.
    if (/^[A-Z0-9"']/.test(trimmed)) {
      cleaned = trimmed;
    }
  }
  const normalized = normalizeDisplayText(cleaned);
  if (/^[a-z]/.test(normalized)) {
    return normalizeDisplayText(body);
  }
  return normalized;
}

function sanitizeArticleBody(body: string): string {
  let cleaned = normalizeDisplayText(body);
  const cutMarkers = [
    /\b\d{1,3}% of .*? still unpatched\b/i,
    /\bAt the Autonomous Validation Summit\b/i,
    /\bA wave of new exploits is coming\b/i,
    /\bRelated articles?:\b/i,
    /\bRecently leaked\b/i,
  ];
  for (const marker of cutMarkers) {
    const idx = cleaned.search(marker);
    if (idx > 120) {
      cleaned = cleaned.slice(0, idx).trim();
      break;
    }
  }

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const compact = sentences.slice(0, 6).join(" ");
  if (compact.length <= 950) return trimToCompleteSentence(compact);

  const head = compact.slice(0, 950).trim();
  let lastTerminal = -1;
  for (let i = head.length - 1; i >= 0; i -= 1) {
    const ch = head[i];
    if (ch === "." || ch === "!" || ch === "?") {
      lastTerminal = i;
      break;
    }
  }
  if (lastTerminal >= 220) {
    return head.slice(0, lastTerminal + 1).trim();
  }
  return `${trimToCompleteSentence(head)}…`;
}

function mapDbRowToIncident(row: SupabaseIncidentRow): Incident {
  const cleanTitle = normalizeDisplayText(row.title);
  const rawSummaryFallback = normalizeDisplayText(
    row.claude_summary.trim() || row.raw_content.trim() || "No summary available.",
  );
  const parsedBriefing = parseStructuredBriefing(row.claude_summary.trim());
  const summary = trimToCompleteSentence(
    dedupeSummaryAgainstTitle(cleanTitle, parsedBriefing?.tldr || rawSummaryFallback),
  );
  const impacted = parsedBriefing?.evidence.systems[0] || inferAffectedFromRow(row, summary);
  const inferredExploited = inferExploitedSignal(`${cleanTitle} ${summary} ${row.raw_content}`);
  const defaultWhyCare =
    "Why this matters: if this affects your stack, treat it as operational risk and assign an owner.";
  const defaultImpact = `This incident affects ${impacted} and can create security or operational disruption if ignored.`;
  const defaultActions = [
    "Confirm whether any affected systems exist in your environment.",
    "Apply vendor guidance or compensating controls in priority order.",
    "Track follow-up updates from primary sources and adjust response.",
  ];
  const content = parsedBriefing
    ? trimToCompleteSentence(parsedBriefing.realWorldImpact)
    : sanitizeArticleBody(
        dedupeBodyAgainstSummary(
          cleanTitle,
          summary,
          row.raw_content.trim() || row.claude_summary.trim() || "Awaiting analyst summary.",
        ),
      );

  return {
    slug: buildSlugFromDb(row),
    title: cleanTitle,
    date: row.published_at,
    severity: parsedBriefing?.severity ?? row.severity,
    affected: normalizeDisplayText(String(impacted ?? "")),
    summary,
    tldr: summary,
    realWorldImpact: parsedBriefing?.realWorldImpact || defaultImpact,
    whyCare: parsedBriefing?.whyCare || defaultWhyCare,
    actionItems: parsedBriefing?.actionItems.length ? parsedBriefing.actionItems : defaultActions,
    iocs: parsedBriefing?.iocs || [],
    ambiguities: parsedBriefing?.ambiguities || [],
    confidenceScore: parsedBriefing?.confidenceScore ?? 0.55,
    evidence: parsedBriefing?.evidence || createEmptyEvidence(),
    exploited: parsedBriefing?.exploited ?? inferredExploited,
    category: classifyIncidentType(row),
    cve: parsedBriefing?.evidence.cves[0] ?? /CVE-\d{4}-\d+/i.exec(cleanTitle)?.[0],
    mitigationStatus: "Monitoring updates",
    sources: [row.source_url],
    content,
  };
}

function classifyIncidentType(row: SupabaseIncidentRow): Exclude<IncidentType, "all"> {
  return classifyIncidentTypeFromText(
    `${normalizeDisplayText(row.title)} ${row.raw_content} ${row.source_name}`,
  );
}

export function classifyIncidentTypeFromText(textInput: string): Exclude<IncidentType, "all"> {
  const text = textInput.toLowerCase();
  const hasZeroDayToken = text.includes("zero-day") || text.includes("0-day");
  const hasActiveExploitSignal = inferExploitedSignal(text) || text.includes("in the wild");
  if (hasZeroDayToken && hasActiveExploitSignal) return "zero-day";
  if (text.includes("supply chain") || text.includes("package") || text.includes("dependency")) return "supply-chain";
  if (text.includes("ransomware")) return "ransomware";
  if (text.includes("identity") || text.includes("sso") || text.includes("mfa") || text.includes("token")) return "identity";
  if (text.includes("phishing") || text.includes("mail") || text.includes("email")) return "email";
  if (text.includes("cloud") || text.includes("aws") || text.includes("azure") || text.includes("gcp")) return "cloud";
  if (text.includes("web") || text.includes("cdn") || text.includes("browser")) return "web";
  if (text.includes("ics") || text.includes("utility") || text.includes("telecom") || text.includes("infrastructure")) return "critical-infrastructure";
  if (text.includes("exploit") || text.includes("botnet")) return "exploitation";
  if (text.includes("consumer") || text.includes("extension") || text.includes("app store")) return "consumer-security";
  if (text.includes("breach") || text.includes("data theft") || text.includes("leak")) return "breach";
  return "other";
}

function normalizeIncidentType(value: string): Exclude<IncidentType, "all"> {
  const normalized = value.trim().toLowerCase();
  const known = INCIDENT_TYPE_OPTIONS.filter((option) => option !== "all" && option !== "other");
  if (known.includes(normalized as Exclude<IncidentType, "all" | "other">)) {
    return normalized as Exclude<IncidentType, "all">;
  }
  return "other";
}

function getMarkdownIncidentSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replace(/\.md$/, ""));
}

function getMarkdownIncidentBySlug(slug: string): Incident | null {
  const fullPath = path.join(CONTENT_DIR, `${slug}.md`);
  if (!fs.existsSync(fullPath)) return null;

  const raw = fs.readFileSync(fullPath, "utf8");
  const parsed = matter(raw);

  const data = parsed.data as IncidentFrontmatter;
  const tldr = normalizeDisplayText(data.tldr || data.summary);
  const realWorldImpact = normalizeDisplayText(
    data.realWorldImpact || parsed.content.split("\n").slice(0, 2).join(" "),
  );
  const whyCare = normalizeDisplayText(
    data.whyCare || "Why this matters: validate exposure and assign an owner if affected.",
  );
  const actionItems = data.actionItems && data.actionItems.length
    ? data.actionItems.map(normalizeDisplayText).filter(Boolean)
    : ["Validate exposure", "Review vendor guidance", "Track updates"];
  const iocs = (data.iocs || []).map(normalizeDisplayText).filter(Boolean);
  const ambiguities = (data.ambiguities || []).map(normalizeDisplayText).filter(Boolean);
  return {
    ...data,
    title: normalizeDisplayText(String(data.title || "")),
    affected: normalizeDisplayText(String(data.affected ?? "")),
    category: normalizeDisplayText(String(data.category ?? "")),
    mitigationStatus: normalizeDisplayText(String(data.mitigationStatus ?? "")),
    summary: tldr,
    slug,
    content: normalizeDisplayText(parsed.content.trim()),
    tldr,
    realWorldImpact,
    whyCare,
    actionItems,
    iocs,
    ambiguities,
    confidenceScore: typeof data.confidenceScore === "number" ? data.confidenceScore : 0.7,
    evidence: createEmptyEvidence(),
    exploited: inferExploitedSignal(`${data.title} ${data.summary} ${parsed.content}`),
  };
}

function getAllMarkdownIncidents(): Incident[] {
  return getMarkdownIncidentSlugs()
    .map(getMarkdownIncidentBySlug)
    .filter((incident): incident is Incident => incident !== null)
    .sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return severityRank[b.severity] - severityRank[a.severity];
    });
}

function normalizeTitleFingerprint(value: string): string {
  return value.toLowerCase().replace(/cve-\d{4}-\d+/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function evidenceTokens(incident: Incident): string {
  const tokenSet = new Set<string>();
  for (const value of [...incident.evidence.packages, ...incident.evidence.systems, ...incident.evidence.cves]) {
    const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (normalized) tokenSet.add(normalized);
  }
  return Array.from(tokenSet).sort().slice(0, 4).join("|");
}

function dedupeFingerprint(incident: Incident): string {
  const day = incident.date.slice(0, 10);
  return `${day}::${normalizeTitleFingerprint(incident.title)}::${evidenceTokens(incident)}`;
}

function mergeIncident(existing: Incident, incoming: Incident): Incident {
  const severity = severityRank[incoming.severity] > severityRank[existing.severity] ? incoming.severity : existing.severity;
  const confidenceScore = Math.max(existing.confidenceScore, incoming.confidenceScore);
  const sources = Array.from(new Set([...existing.sources, ...incoming.sources]));
  const iocs = Array.from(new Set([...existing.iocs, ...incoming.iocs]));
  const ambiguities = Array.from(new Set([...existing.ambiguities, ...incoming.ambiguities]));
  const actionItems = Array.from(new Set([...existing.actionItems, ...incoming.actionItems])).slice(0, 6);
  return {
    ...existing,
    severity,
    confidenceScore,
    sources,
    iocs,
    ambiguities,
    actionItems,
    exploited: existing.exploited || incoming.exploited,
    evidence: {
      packages: Array.from(new Set([...existing.evidence.packages, ...incoming.evidence.packages])),
      versions: Array.from(new Set([...existing.evidence.versions, ...incoming.evidence.versions])),
      cves: Array.from(new Set([...existing.evidence.cves, ...incoming.evidence.cves])),
      dates: Array.from(new Set([...existing.evidence.dates, ...incoming.evidence.dates])),
      systems: Array.from(new Set([...existing.evidence.systems, ...incoming.evidence.systems])),
    },
    whyCare: existing.confidenceScore >= incoming.confidenceScore ? existing.whyCare : incoming.whyCare,
    realWorldImpact:
      existing.confidenceScore >= incoming.confidenceScore ? existing.realWorldImpact : incoming.realWorldImpact,
  };
}

async function getAllSupabaseIncidents(): Promise<Incident[]> {
  const client = getSupabaseServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("incidents")
    .select("id,title,source_url,source_name,raw_content,claude_summary,severity,published_at,created_at")
    .order("published_at", { ascending: false })
    .limit(500);

  if (error || !data) {
    console.error("Failed loading incidents from Supabase", error);
    return [];
  }

  const deduped = new Map<string, Incident>();
  for (const incident of (data as SupabaseIncidentRow[]).map(mapDbRowToIncident)) {
    const key = dedupeFingerprint(incident);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, incident);
      continue;
    }
    deduped.set(key, mergeIncident(existing, incident));
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return severityRank[b.severity] - severityRank[a.severity];
  });
}

export async function getAllIncidents(): Promise<Incident[]> {
  if (DATA_SOURCE === "supabase") {
    const dbIncidents = await getAllSupabaseIncidents();
    if (dbIncidents.length > 0) return dbIncidents;
  }
  return getAllMarkdownIncidents();
}

export async function getIncidentBySlug(slug: string): Promise<Incident | null> {
  if (DATA_SOURCE === "supabase") {
    const incidents = await getAllSupabaseIncidents();
    const hit = incidents.find((incident) => incident.slug === slug);
    if (hit) return hit;
  }
  return getMarkdownIncidentBySlug(slug);
}

export async function getIncidentSlugs(): Promise<string[]> {
  const incidents = await getAllIncidents();
  return incidents.map((incident) => incident.slug);
}

type IncidentFilter = {
  severity?: Severity | "all";
  type?: IncidentType;
  window?: "7d" | "30d" | "90d" | "all";
  query?: string;
  /** When true, only incidents flagged as actively exploited. */
  onlyExploited?: boolean;
  /** When true, only incidents whose mitigation label looks resolved/patched. */
  onlyMitigated?: boolean;
};

/** Shared with sidebar counts: “mitigated” filter bucket. */
export function mitigationStatusLooksMitigated(status: string): boolean {
  return /mitigat|patch|fixed|resolved|remediat|vendor update|update available/i.test(status);
}

export function filterIncidents(
  incidents: Incident[],
  filter: IncidentFilter,
): Incident[] {
  const query = (filter.query ?? "").trim().toLowerCase();
  const now = new Date();
  const windowDays = filter.window === "all" || !filter.window
    ? null
    : Number.parseInt(filter.window, 10);

  return incidents.filter((incident) => {
    if (filter.severity && filter.severity !== "all" && incident.severity !== filter.severity) {
      return false;
    }

    if (filter.onlyExploited && !incident.exploited) {
      return false;
    }

    if (filter.onlyMitigated && !mitigationStatusLooksMitigated(incident.mitigationStatus)) {
      return false;
    }

    if (filter.type && filter.type !== "all") {
      const incidentType = normalizeIncidentType(incident.category);
      if (incidentType !== filter.type) return false;
    }

    if (windowDays !== null) {
      const ageMs = now.getTime() - new Date(incident.date).getTime();
      if (ageMs > windowDays * 24 * 60 * 60 * 1000) return false;
    }

    if (query.length > 0) {
      const haystack = [
        incident.title,
        incident.summary,
        incident.affected,
        incident.category,
        incident.content,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    }

    return true;
  });
}

export function getSeverityTone(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "text-red-300 border-red-500/50 bg-red-500/10";
    case "high":
      return "text-orange-300 border-orange-500/50 bg-orange-500/10";
    case "medium":
      return "text-amber-300 border-amber-500/50 bg-amber-500/10";
    case "low":
      return "text-emerald-300 border-emerald-500/50 bg-emerald-500/10";
    default:
      return "text-zinc-300 border-zinc-500/50 bg-zinc-500/10";
  }
}

