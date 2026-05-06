import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import type {
  Incident,
  IncidentEvidence,
  IncidentFrontmatter,
  IncidentType,
  SocialDataQuality,
  SocialMetricExplainers,
  SocialTrend,
  Severity,
} from "./incident-types";
import { INCIDENT_TYPE_OPTIONS } from "./incident-types";
import { decodeHtmlEntities, stripInvisibleUnicode } from "./html-entities";
import { omitEditorialListingNoise } from "./editorial-listing-filter";
import { withTimeout } from "./promise-timeout";

export type { Incident, IncidentEvidence, IncidentFrontmatter, IncidentType, SocialDataQuality, SocialTrend, Severity };
export { INCIDENT_TYPE_OPTIONS };
export { formatIncidentDate } from "./format-incident-date";

const CONTENT_DIR = path.join(process.cwd(), "content");
const DATA_SOURCE = process.env.DATA_SOURCE?.trim().toLowerCase();

function resolveDataSource(): "supabase" | "markdown" {
  if (DATA_SOURCE === "supabase" || DATA_SOURCE === "markdown") {
    return DATA_SOURCE;
  }
  // Safe production default: if Supabase credentials are present, prefer live data.
  const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasSupabaseKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return hasSupabaseUrl && hasSupabaseKey ? "supabase" : "markdown";
}

const severityRank: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

type SupabaseIncidentRow = {
  id: string;
  canonical_id?: string;
  canonical_version?: number;
  merged_from?: string[] | null;
  title: string;
  source_url: string;
  source_name: string;
  raw_content: string;
  claude_summary: string;
  severity: Severity;
  published_at: string;
  created_at: string;
};

type SupabaseSocialMetricRow = {
  incident_id: string;
  social_mentions_24h: number | null;
  social_trend: SocialTrend | null;
  social_summary: string | null;
  social_delta_24h_pct: number | null;
  social_platform_split: unknown;
  social_keywords: string[] | null;
  source: string | null;
  updated_at: string | null;
  social_metric_explainers: unknown;
  x_mentions_24h: number | null;
  x_unique_authors_24h: number | null;
  x_verified_mentions_24h: number | null;
  x_retweet_sum_24h: number | null;
  x_like_sum_24h: number | null;
  x_quote_sum_24h: number | null;
  x_reply_sum_24h: number | null;
  x_heat_score: number | null;
  x_heat_trend: SocialTrend | null;
  x_top_hashtags: string[] | null;
  x_top_terms: string[] | null;
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

function normalizeSeverity(value: unknown): Severity {
  if (value === "critical" || value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function maxSeverity(a: Severity, b: Severity): Severity {
  return severityRank[a] >= severityRank[b] ? a : b;
}

export type SeverityInferenceResult = {
  severity: Severity;
  /** Human-readable rationale for auto-uplift beyond stored severity / briefing. */
  rationale: string[];
  baseSeverity: Severity;
};

export function inferSeverityFromSignalsWithRationale(input: {
  title: string;
  summary: string;
  raw: string;
  category: string;
  exploited: boolean;
  evidence: IncidentEvidence;
  base: Severity;
}): SeverityInferenceResult {
  const text = `${input.title} ${input.summary} ${input.raw} ${input.category}`.toLowerCase();
  let severity = input.base;
  const rationale: string[] = [];

  const hasCve = input.evidence.cves.length > 0 || /\bcve-\d{4}-\d+\b/i.test(text);
  const hasRansomware = /ransomware|double extortion|lockbit|cl0p|ryuk|blackcat|akira/i.test(text);
  const hasActiveExploit = input.exploited || inferExploitedSignal(text) || /in the wild|active exploitation|weaponized/i.test(text);
  const hasZeroDay = /zero-day|0-day|unpatched zero day|0day/i.test(text);
  const hasMassImpact = /mass exploitation|widespread|internet-facing|public exploit|critical infrastructure|hospital|utility|government/i.test(text);

  if (hasCve) {
    severity = maxSeverity(severity, "high");
    rationale.push("CVE or advisory identifiers detected — floor raised to at least high.");
  }
  if (hasActiveExploit) {
    severity = maxSeverity(severity, "high");
    rationale.push("Active exploitation / in-the-wild language detected — floor raised to at least high.");
  }
  if (hasRansomware) {
    severity = maxSeverity(severity, "high");
    rationale.push("Ransomware campaign indicators detected — floor raised to at least high.");
  }
  if ((hasZeroDay && hasActiveExploit) || (hasRansomware && hasMassImpact)) {
    severity = "critical";
    rationale.push("Combined zero-day/exploit + ransomware/mass-impact signals → critical.");
  } else if (hasMassImpact && hasActiveExploit) {
    severity = maxSeverity(severity, "critical");
    rationale.push("Mass-impact scope with confirmed exploitation → uplift toward critical.");
  }

  return { severity, rationale, baseSeverity: input.base };
}

function inferSeverityFromSignals(input: {
  title: string;
  summary: string;
  raw: string;
  category: string;
  exploited: boolean;
  evidence: IncidentEvidence;
  base: Severity;
}): Severity {
  return inferSeverityFromSignalsWithRationale(input).severity;
}

function parseSocialMetricExplainers(raw: unknown): SocialMetricExplainers | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Partial<SocialMetricExplainers>;
  if (typeof o.window_hours !== "number") return undefined;
  return {
    window_hours: o.window_hours,
    scan_started_at: typeof o.scan_started_at === "string" ? o.scan_started_at : undefined,
    scan_finished_at: typeof o.scan_finished_at === "string" ? o.scan_finished_at : undefined,
    scan_latency_ms: typeof o.scan_latency_ms === "number" ? o.scan_latency_ms : undefined,
    platforms: o.platforms,
    total_observed: typeof o.total_observed === "number" ? o.total_observed : undefined,
    split_source: o.split_source,
    notes: Array.isArray(o.notes) ? o.notes.filter((n): n is string => typeof n === "string") : undefined,
  };
}

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

export function buildIncidentSlug(dateIso: string, title: string, id: string): string {
  const datePrefix = new Date(dateIso).toISOString().slice(0, 10);
  const titleSlug = slugify(title);
  const idShort = id.slice(0, 8);
  return `${datePrefix}-${titleSlug}-${idShort}`;
}

function buildSlugFromDb(row: SupabaseIncidentRow): string {
  return buildIncidentSlug(row.published_at, row.title, row.id);
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

function classifySocialDataQuality(socialMetrics: SupabaseSocialMetricRow | undefined): SocialDataQuality {
  if (!socialMetrics) return "pending";
  const source = (socialMetrics.source ?? "").trim().toLowerCase();
  if (source !== "github+reddit+x") return "pending";
  const mentions = socialMetrics.social_mentions_24h ?? 0;
  return mentions > 0 ? "live_measured" : "live_zero";
}

function mapDbRowToIncident(row: SupabaseIncidentRow, socialMetrics?: SupabaseSocialMetricRow): Incident {
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
  const incidentSeverityBase = normalizeSeverity(parsedBriefing?.severity ?? row.severity);
  const incidentExploited = parsedBriefing?.exploited ?? inferredExploited;
  const incidentCategory = classifyIncidentType(row);
  const severityPack = inferSeverityFromSignalsWithRationale({
    title: cleanTitle,
    summary,
    raw: row.raw_content,
    category: incidentCategory,
    exploited: incidentExploited,
    evidence: parsedBriefing?.evidence || createEmptyEvidence(),
    base: incidentSeverityBase,
  });
  const incidentSeverity = severityPack.severity;
  const socialPulse = deriveSocialPulse({
    severity: incidentSeverity,
    exploited: incidentExploited,
    title: cleanTitle,
    category: incidentCategory,
    summary,
  });
  const socialDataQuality = classifySocialDataQuality(socialMetrics);
  const splitFromDb = normalizeSocialPlatformSplit(socialMetrics?.social_platform_split);
  /** Only expose platform % when the refresh observed non-zero cross-platform volume (split is from APIs). */
  const socialPlatformSplit = socialDataQuality === "live_measured" ? splitFromDb : undefined;
  const explainers = parseSocialMetricExplainers(socialMetrics?.social_metric_explainers);

  return {
    slug: buildSlugFromDb(row),
    title: cleanTitle,
    date: row.published_at,
    canonicalId: row.canonical_id ?? row.id,
    canonicalVersion: typeof row.canonical_version === "number" ? row.canonical_version : 1,
    sourceRowIds: [row.id],
    severityInference: severityPack.rationale,
    severity: incidentSeverity,
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
    exploited: incidentExploited,
    category: incidentCategory,
    cve: parsedBriefing?.evidence.cves[0] ?? /CVE-\d{4}-\d+/i.exec(cleanTitle)?.[0],
    mitigationStatus: "Monitoring updates",
    sources: [row.source_url],
    content,
    socialMentions24h:
      socialDataQuality === "pending"
        ? 0
        : (socialMetrics?.social_mentions_24h ?? 0),
    socialTrend:
      socialDataQuality === "pending"
        ? "flat"
        : (normalizeSocialTrend(socialMetrics?.social_trend) ?? "flat"),
    socialSummary:
      socialDataQuality === "pending"
        ? "Social scan not run yet for this incident."
        : (typeof socialMetrics?.social_summary === "string"
          ? normalizeDisplayText(socialMetrics.social_summary)
          : socialPulse.socialSummary),
    socialDelta24hPct: socialDataQuality === "pending" ? undefined : socialMetrics?.social_delta_24h_pct ?? undefined,
    socialPlatformSplit,
    socialKeywords:
      socialDataQuality === "pending"
        ? undefined
        : Array.isArray(socialMetrics?.social_keywords)
          ? socialMetrics.social_keywords.map(normalizeDisplayText).filter(Boolean).slice(0, 5)
          : undefined,
    socialDataQuality,
    socialMetricExplainers: explainers,
    socialMetricsUpdatedAt:
      socialMetrics?.updated_at && typeof socialMetrics.updated_at === "string"
        ? socialMetrics.updated_at
        : undefined,
    xMentions24h: socialDataQuality === "pending" ? undefined : socialMetrics?.x_mentions_24h ?? undefined,
    xUniqueAuthors24h: socialDataQuality === "pending" ? undefined : socialMetrics?.x_unique_authors_24h ?? undefined,
    xVerifiedMentions24h: socialDataQuality === "pending" ? undefined : socialMetrics?.x_verified_mentions_24h ?? undefined,
    xRetweetSum24h: socialDataQuality === "pending" ? undefined : socialMetrics?.x_retweet_sum_24h ?? undefined,
    xLikeSum24h: socialDataQuality === "pending" ? undefined : socialMetrics?.x_like_sum_24h ?? undefined,
    xQuoteSum24h: socialDataQuality === "pending" ? undefined : socialMetrics?.x_quote_sum_24h ?? undefined,
    xReplySum24h: socialDataQuality === "pending" ? undefined : socialMetrics?.x_reply_sum_24h ?? undefined,
    xHeatScore: socialDataQuality === "pending" ? undefined : socialMetrics?.x_heat_score ?? undefined,
    xHeatTrend: socialDataQuality === "pending" ? undefined : normalizeSocialTrend(socialMetrics?.x_heat_trend) ?? undefined,
    xTopHashtags:
      socialDataQuality === "pending"
        ? undefined
        : Array.isArray(socialMetrics?.x_top_hashtags)
          ? socialMetrics.x_top_hashtags.map(normalizeDisplayText).filter(Boolean).slice(0, 6)
          : undefined,
    xTopTerms:
      socialDataQuality === "pending"
        ? undefined
        : Array.isArray(socialMetrics?.x_top_terms)
          ? socialMetrics.x_top_terms.map(normalizeDisplayText).filter(Boolean).slice(0, 6)
          : undefined,
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

function normalizeSocialTrend(value: unknown): SocialTrend | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "up" || normalized === "flat" || normalized === "down") {
    return normalized;
  }
  return undefined;
}

function normalizeSocialPlatformSplit(
  value: unknown,
): { x: number; reddit: number; github: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  const x = Number(rec.x);
  const reddit = Number(rec.reddit);
  const github = Number(rec.github);
  if (![x, reddit, github].every(Number.isFinite)) return undefined;
  return {
    x: Math.max(0, Math.round(x)),
    reddit: Math.max(0, Math.round(reddit)),
    github: Math.max(0, Math.round(github)),
  };
}

type SocialPulse = {
  socialMentions24h: number;
  socialTrend: SocialTrend;
  socialSummary: string;
};

function deriveSocialPulse(input: {
  severity: Severity;
  exploited: boolean;
  title: string;
  category: string;
  summary: string;
}): SocialPulse {
  const text = `${input.title} ${input.category} ${input.summary}`.toLowerCase();
  const stableHash = [...text].reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) % 100_000, 7);
  const variance = (stableHash % 181) - 90;
  const baseBySeverity: Record<Severity, number> = {
    critical: 1200,
    high: 650,
    medium: 280,
    low: 140,
  };

  let mentions = baseBySeverity[input.severity];
  if (input.exploited) mentions += 260;
  if (/zero-day|ransom|breach|cve-/i.test(text)) mentions += 110;
  if (/patch|mitigation|monitoring|resolved/i.test(text)) mentions -= 80;
  mentions += variance;
  mentions = Math.max(60, mentions);

  let velocityScore = 0;
  if (input.exploited) velocityScore += 3;
  if (input.severity === "critical") velocityScore += 2;
  if (input.severity === "high") velocityScore += 1;
  if (/zero-day|ransom|breach|active|campaign|exploit/i.test(text)) velocityScore += 2;
  if (/patch|resolved|contained|postmortem|recovery/i.test(text)) velocityScore -= 2;
  velocityScore += (stableHash % 5) - 2;

  const trend: SocialTrend = velocityScore >= 2 ? "up" : velocityScore <= -2 ? "down" : "flat";

  const summaryByTrend: Record<SocialTrend, string> = {
    up: "Conversation is accelerating with active-response chatter and exploit validation.",
    flat: "Discussion is steady around exposure checks and mitigation updates.",
    down: "Mentions are tapering as immediate response actions stabilize.",
  };

  return {
    socialMentions24h: mentions,
    socialTrend: trend,
    socialSummary: summaryByTrend[trend],
  };
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
  const exploited = inferExploitedSignal(`${data.title} ${data.summary} ${parsed.content}`);
  const mdCategory = normalizeDisplayText(String(data.category ?? ""));
  const mdTitle = normalizeDisplayText(String(data.title || ""));
  const severityPackMd = inferSeverityFromSignalsWithRationale({
    title: mdTitle,
    summary: tldr,
    raw: parsed.content,
    category: mdCategory || "other",
    exploited,
    evidence: createEmptyEvidence(),
    base: normalizeSeverity(data.severity),
  });
  return {
    ...data,
    title: mdTitle,
    affected: normalizeDisplayText(String(data.affected ?? "")),
    category: mdCategory,
    mitigationStatus: normalizeDisplayText(String(data.mitigationStatus ?? "")),
    severity: severityPackMd.severity,
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
    exploited,
    socialMentions24h: typeof data.socialMentions24h === "number" ? data.socialMentions24h : 0,
    socialTrend: normalizeSocialTrend(data.socialTrend) ?? "flat",
    socialSummary:
      (typeof data.socialSummary === "string" ? normalizeDisplayText(data.socialSummary) : undefined)
      ?? "Markdown preview: live social totals come from the production refresh pipeline.",
    socialDelta24hPct: typeof data.socialDelta24hPct === "number" ? data.socialDelta24hPct : undefined,
    socialPlatformSplit: normalizeSocialPlatformSplit(data.socialPlatformSplit),
    socialKeywords: Array.isArray(data.socialKeywords)
      ? data.socialKeywords.map(normalizeDisplayText).filter(Boolean).slice(0, 5)
      : undefined,
    socialDataQuality: "pending",
    sourceRowIds: [],
    canonicalVersion: 1,
    severityInference: severityPackMd.rationale,
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

function socialQualityRank(q: SocialDataQuality | undefined): number {
  if (q === "live_measured") return 3;
  if (q === "live_zero") return 2;
  return 1;
}

function pickSocialBlock(incident: Incident) {
  return {
    socialMentions24h: incident.socialMentions24h,
    socialTrend: incident.socialTrend,
    socialSummary: incident.socialSummary,
    socialDelta24hPct: incident.socialDelta24hPct,
    socialPlatformSplit: incident.socialPlatformSplit,
    socialKeywords: incident.socialKeywords,
    socialDataQuality: incident.socialDataQuality,
    socialMetricExplainers: incident.socialMetricExplainers,
    socialMetricsUpdatedAt: incident.socialMetricsUpdatedAt,
    xMentions24h: incident.xMentions24h,
    xUniqueAuthors24h: incident.xUniqueAuthors24h,
    xVerifiedMentions24h: incident.xVerifiedMentions24h,
    xRetweetSum24h: incident.xRetweetSum24h,
    xLikeSum24h: incident.xLikeSum24h,
    xQuoteSum24h: incident.xQuoteSum24h,
    xReplySum24h: incident.xReplySum24h,
    xHeatScore: incident.xHeatScore,
    xHeatTrend: incident.xHeatTrend,
    xTopHashtags: incident.xTopHashtags,
    xTopTerms: incident.xTopTerms,
  };
}

function mergeIncident(existing: Incident, incoming: Incident): Incident {
  const severity = severityRank[incoming.severity] > severityRank[existing.severity] ? incoming.severity : existing.severity;
  const confidenceScore = Math.max(existing.confidenceScore, incoming.confidenceScore);
  const sources = Array.from(new Set([...existing.sources, ...incoming.sources]));
  const iocs = Array.from(new Set([...existing.iocs, ...incoming.iocs]));
  const ambiguities = Array.from(new Set([...existing.ambiguities, ...incoming.ambiguities]));
  const actionItems = Array.from(new Set([...existing.actionItems, ...incoming.actionItems])).slice(0, 6);
  const rIn = socialQualityRank(incoming.socialDataQuality);
  const rEx = socialQualityRank(existing.socialDataQuality);
  const socialBlock =
    rIn > rEx ? pickSocialBlock(incoming) : rEx > rIn ? pickSocialBlock(existing) : pickSocialBlock(existing);
  const canonicalId = existing.canonicalId ?? incoming.canonicalId;
  const canonicalVersion = Math.max(existing.canonicalVersion ?? 1, incoming.canonicalVersion ?? 1);
  const sourceRowIds = Array.from(new Set([...(existing.sourceRowIds ?? []), ...(incoming.sourceRowIds ?? [])]));
  const severityInference = Array.from(
    new Set([...(existing.severityInference ?? []), ...(incoming.severityInference ?? [])]),
  );
  return {
    ...existing,
    canonicalId,
    canonicalVersion,
    sourceRowIds,
    severityInference,
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
    ...socialBlock,
  };
}

const SUPABASE_INCIDENTS_MS = 30_000;

async function getAllSupabaseIncidents(): Promise<Incident[]> {
  const client = getSupabaseServerClient();
  if (!client) return [];

  const incidentsQuery = Promise.resolve(
    client
      .from("incidents")
      .select(
        "id,canonical_id,canonical_version,merged_from,title,source_url,source_name,raw_content,claude_summary,severity,published_at,created_at",
      )
      .order("published_at", { ascending: false })
      .limit(500),
  );
  const { data, error } = await withTimeout(
    incidentsQuery,
    SUPABASE_INCIDENTS_MS,
    { data: null, error: { message: "timeout" } } as unknown as Awaited<typeof incidentsQuery>,
  );

  if (error || !data) {
    if (error && typeof error === "object" && "message" in error && error.message === "timeout") {
      console.error("Timed out loading incidents from Supabase");
    } else {
      console.error("Failed loading incidents from Supabase", error);
    }
    return [];
  }
  const rows = data as SupabaseIncidentRow[];
  const incidentIds = rows.map((row) => row.id);
  const metricByIncidentId = new Map<string, SupabaseSocialMetricRow>();
  if (incidentIds.length > 0) {
    const socialQuery = Promise.resolve(
      client
        .from("incident_social_metrics")
        .select(
          "incident_id,social_mentions_24h,social_trend,social_summary,social_delta_24h_pct,social_platform_split,social_keywords,source,updated_at,social_metric_explainers,x_mentions_24h,x_unique_authors_24h,x_verified_mentions_24h,x_retweet_sum_24h,x_like_sum_24h,x_quote_sum_24h,x_reply_sum_24h,x_heat_score,x_heat_trend,x_top_hashtags,x_top_terms",
        )
        .in("incident_id", incidentIds),
    );
    const { data: socialRows, error: socialError } = await withTimeout(
      socialQuery,
      SUPABASE_INCIDENTS_MS,
      { data: null, error: { message: "timeout" } } as unknown as Awaited<typeof socialQuery>,
    );
    if (socialError) {
      if (typeof socialError === "object" && "message" in socialError && socialError.message === "timeout") {
        console.error("Timed out loading social metrics from Supabase");
      } else {
        console.error("Failed loading social metrics from Supabase", socialError);
      }
    } else {
      for (const metric of (socialRows as SupabaseSocialMetricRow[] | null) ?? []) {
        metricByIncidentId.set(metric.incident_id, metric);
      }
    }
  }

  const deduped = new Map<string, Incident>();
  for (const incident of rows.map((row) => mapDbRowToIncident(row, metricByIncidentId.get(row.id)))) {
    // Use stable identity keys for DB incidents; title/evidence-level dedupe was
    // collapsing too aggressively when many rows shared similar summaries.
    const key = incident.canonicalId || incident.sources[0] || incident.slug;
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

async function loadAllIncidentsFromSource(): Promise<Incident[]> {
  let incidents: Incident[];
  if (resolveDataSource() === "supabase") {
    incidents = await getAllSupabaseIncidents();
  } else {
    incidents = getAllMarkdownIncidents();
  }
  return omitEditorialListingNoise(incidents);
}

/** Cross-request cache (120s) + per-request dedupe: critical for traffic spikes (layout + page + feeds). */
const loadAllIncidentsCached = unstable_cache(loadAllIncidentsFromSource, ["incidents-all"], {
  revalidate: 120,
  tags: ["incidents"],
});

export const getAllIncidents = cache(loadAllIncidentsCached);

export async function getIncidentBySlug(slug: string): Promise<Incident | null> {
  const incidents = await getAllIncidents();
  const hit = incidents.find((incident) => incident.slug === slug);
  if (hit) return hit;
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

/** Label heuristic for “resolved enough” mitigation copy in summaries. */
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

