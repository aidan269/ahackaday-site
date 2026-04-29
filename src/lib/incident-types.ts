export type Severity = "critical" | "high" | "medium" | "low";
export type SocialTrend = "up" | "flat" | "down";

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
