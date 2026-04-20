import fs from "node:fs";
import path from "node:path";

import matter from "gray-matter";

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

const CONTENT_DIR = path.join(process.cwd(), "content");

const severityRank: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function getIncidentSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replace(/\.md$/, ""));
}

export function getIncidentBySlug(slug: string): Incident | null {
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

export function getAllIncidents(): Incident[] {
  return getIncidentSlugs()
    .map(getIncidentBySlug)
    .filter((incident): incident is Incident => incident !== null)
    .sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return severityRank[b.severity] - severityRank[a.severity];
    });
}

type IncidentFilter = {
  severity?: Severity | "all";
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
