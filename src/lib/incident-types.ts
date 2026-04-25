export type Severity = "critical" | "high" | "medium" | "low";

export type IncidentFrontmatter = {
  title: string;
  date: string;
  severity: Severity;
  affected: string;
  summary: string;
  category: string;
  mitigationStatus: string;
  sources: string[];
  tldr?: string;
  realWorldImpact?: string;
  whyCare?: string;
  actionItems?: string[];
  iocs?: string[];
  ambiguities?: string[];
  confidenceScore?: number;
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
  content: string;
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
