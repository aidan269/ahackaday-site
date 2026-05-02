export type Severity = "critical" | "high" | "medium" | "low";
export type SocialTrend = "up" | "flat" | "down";

/** Provenance for merged social metrics (Supabase + /api/social/refresh). */
export type SocialDataQuality =
  /** Refresh ran with total cross-platform mentions above zero — platform split is from observed API counts. */
  | "live_measured"
  /** Refresh ran but total mentions were 0 — do not treat platform % as measured. */
  | "live_zero"
  /** No refresh row yet, or row predates unified scanner — do not invent totals or splits. */
  | "pending";

/** Structured provenance from last social refresh (Phase 2). */
export type SocialMetricExplainers = {
  window_hours: number;
  scan_started_at?: string;
  scan_finished_at?: string;
  scan_latency_ms?: number;
  platforms?: Partial<
    Record<
      "x" | "reddit" | "github",
      {
        raw_count?: number;
        partial_scan?: boolean;
        rate_limited?: boolean;
        note?: string;
      }
    >
  >;
  total_observed?: number;
  split_source?: "observed_counts" | "synthetic_when_zero";
  notes?: string[];
};

export type IncidentClaimRecord = {
  id: string;
  field: string;
  value: string;
  sourceUrl: string | null;
  snippet: string | null;
  confidence: number | null;
  inferredBy: "source" | "model" | "heuristic";
  createdAt: string;
};

export type IncidentRevisionRecord = {
  id: string;
  revisionNo: number;
  changedFields: string[];
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  source: string;
  note: string | null;
  createdAt: string;
};

export type IncidentFrontmatter = {
  title: string;
  date: string;
  severity: Severity;
  affected: string;
  summary: string;
  category: string;
  mitigationStatus: string;
  sources: string[];
  cve?: string;
  tldr?: string;
  realWorldImpact?: string;
  whyCare?: string;
  actionItems?: string[];
  iocs?: string[];
  ambiguities?: string[];
  confidenceScore?: number;
  /** Stable UUID separate from URL slug (Supabase-backed incidents). */
  canonicalId?: string;
  canonicalVersion?: number;
  /** Primary DB row ids backing this merged incident view. */
  sourceRowIds?: string[];
  severityInference?: string[];
  socialMetricExplainers?: SocialMetricExplainers;
  socialMentions24h?: number;
  socialTrend?: SocialTrend;
  socialSummary?: string;
  socialDelta24hPct?: number;
  socialPlatformSplit?: {
    x: number;
    reddit: number;
    github: number;
  };
  socialKeywords?: string[];
  xMentions24h?: number;
  xUniqueAuthors24h?: number;
  xVerifiedMentions24h?: number;
  xRetweetSum24h?: number;
  xLikeSum24h?: number;
  xQuoteSum24h?: number;
  xReplySum24h?: number;
  xHeatScore?: number;
  xHeatTrend?: SocialTrend;
  xTopHashtags?: string[];
  xTopTerms?: string[];
  socialDataQuality?: SocialDataQuality;
  /** ISO timestamp from `incident_social_metrics.updated_at` when a row exists. */
  socialMetricsUpdatedAt?: string;
  /** Aggregated community ranking signal (votes/comments/saves). */
  communityScore?: number;
};

export type IncidentEvidence = {
  packages: string[];
  versions: string[];
  cves: string[];
  dates: string[];
  systems: string[];
};

export type Incident = IncidentFrontmatter & {
  slug: string;
  content: string | Array<{ h: string; p: string }>;
  tldr: string;
  realWorldImpact: string;
  whyCare: string;
  actionItems: string[];
  iocs: string[];
  ambiguities: string[];
  confidenceScore: number;
  evidence: IncidentEvidence;
  exploited: boolean;
};

export const INCIDENT_TYPE_OPTIONS = [
  "all",
  "zero-day",
  "supply-chain",
  "breach",
  "ransomware",
  "identity",
  "cloud",
  "web",
  "email",
  "critical-infrastructure",
  "exploitation",
  "consumer-security",
  "other",
] as const;

export type IncidentType = (typeof INCIDENT_TYPE_OPTIONS)[number];
