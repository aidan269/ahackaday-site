import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";

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
};

export type Incident = IncidentFrontmatter & {
  slug: string;
  content: string;
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
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

function mapDbRowToIncident(row: SupabaseIncidentRow): Incident {
  const summary = row.claude_summary.trim() || row.raw_content.trim() || "No summary available.";
  const content = row.claude_summary.trim()
    ? row.claude_summary.trim()
    : `## What happened\n${row.raw_content.trim() || "Awaiting analyst summary."}`;

  return {
    slug: buildSlugFromDb(row),
    title: row.title,
    date: row.published_at,
    severity: row.severity,
    affected: row.source_name,
    summary,
    category: classifyIncidentType(row),
    mitigationStatus: "Monitoring updates",
    sources: [row.source_url],
    content,
  };
}

function classifyIncidentType(row: SupabaseIncidentRow): Exclude<IncidentType, "all"> {
  const text = `${row.title} ${row.raw_content} ${row.source_name}`.toLowerCase();
  if (text.includes("zero-day") || text.includes("0-day")) return "zero-day";
  if (text.includes("supply chain") || text.includes("package") || text.includes("dependency")) return "supply-chain";
  if (text.includes("ransomware")) return "ransomware";
  if (text.includes("identity") || text.includes("sso") || text.includes("mfa") || text.includes("token")) return "identity";
  if (text.includes("phishing") || text.includes("mail") || text.includes("email")) return "email";
  if (text.includes("cloud") || text.includes("aws") || text.includes("azure") || text.includes("gcp")) return "cloud";
  if (text.includes("web") || text.includes("cdn") || text.includes("browser")) return "web";
  if (text.includes("ics") || text.includes("utility") || text.includes("telecom") || text.includes("infrastructure")) return "critical-infrastructure";
  if (text.includes("exploit") || text.includes("botnet") || text.includes("appliance")) return "exploitation";
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
  return {
    ...data,
    slug,
    content: parsed.content.trim(),
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

  return (data as SupabaseIncidentRow[]).map(mapDbRowToIncident).sort((a, b) => {
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
};

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

export function formatIncidentDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}
