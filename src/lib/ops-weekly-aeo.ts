import type { Incident } from "@/lib/incident-types";

export type WeeklyAeoBrief = {
  generated_at: string;
  week_of: string;
  topics: string[];
  recommendations: string[];
  feedback: string[];
};

function toTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 4);
}

function weekStartIso(date = new Date()): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function buildWeeklyAeoBrief(input: {
  incidents: Incident[];
  recommendations?: Array<{ title?: string; status?: string }>;
}): WeeklyAeoBrief {
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - (1000 * 60 * 60 * 24 * 10));
  const recent = input.incidents.filter((incident) => new Date(incident.date).getTime() >= lookbackStart.getTime());

  const topicCounts = new Map<string, number>();
  for (const incident of recent) {
    const seeds = new Set<string>([
      incident.category.toLowerCase(),
      incident.severity.toLowerCase(),
      ...toTokens(incident.title).slice(0, 5),
    ]);
    for (const seed of seeds) {
      topicCounts.set(seed, (topicCounts.get(seed) ?? 0) + 1);
    }
  }
  const topics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic)
    .slice(0, 5);

  const openRecommendations = (input.recommendations ?? [])
    .filter((rec) => (rec.status ?? "todo") !== "done")
    .map((rec) => rec.title?.trim())
    .filter((title): title is string => Boolean(title));

  const fallbackRecommendations = [
    "Publish one high-intent FAQ cluster per top topic with direct answer-first formatting.",
    "Add comparison-style briefs that benchmark mitigation paths by effort and impact.",
    "Refresh top-performing incidents weekly with 'what changed' updates for model recrawl.",
  ];

  const recommendations = (openRecommendations.length > 0 ? openRecommendations : fallbackRecommendations).slice(0, 4);

  const criticalCount = recent.filter((incident) => incident.severity === "critical").length;
  const zeroDayCount = recent.filter((incident) => /zero-day|0-day/i.test(`${incident.title} ${incident.summary}`)).length;
  const geoMix = new Set(recent.map((incident) => incident.category.toLowerCase())).size;
  const feedback = [
    `Coverage mix: ${geoMix} topic clusters in the last ${recent.length} incidents — expand underrepresented clusters.`,
    `Priority pressure: ${criticalCount} critical incidents and ${zeroDayCount} zero-day mentions this cycle.`,
    "Add explicit 'answer in one sentence' blocks near the top of each brief to improve AI citation likelihood.",
  ];

  return {
    generated_at: new Date().toISOString(),
    week_of: weekStartIso(now),
    topics,
    recommendations,
    feedback,
  };
}
