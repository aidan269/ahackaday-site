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

function isCantinaIncident(incident: Incident): boolean {
  return incident.sources.some((source) => source.toLowerCase().includes("cantina.security"));
}

function topicSeedsForIncident(incident: Incident): string[] {
  return Array.from(
    new Set<string>([
      incident.category.toLowerCase(),
      incident.severity.toLowerCase(),
      ...toTokens(incident.title).slice(0, 5),
      ...toTokens(incident.summary).slice(0, 4),
    ]),
  );
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
  const topicTrendScore = new Map<string, number>();
  const cantinaTopicCoverage = new Map<string, number>();

  for (const incident of recent) {
    const seeds = topicSeedsForIncident(incident);
    const mentions = incident.socialMentions24h ?? 0;
    const delta = incident.socialDelta24hPct ?? 0;
    const trendBoost = incident.socialTrend === "up" ? 1.3 : incident.socialTrend === "down" ? 0.8 : 1;
    const momentum = Math.max(1, Math.round((mentions + Math.max(0, delta) * 4 + 20) * trendBoost));
    for (const seed of seeds) {
      topicCounts.set(seed, (topicCounts.get(seed) ?? 0) + 1);
      topicTrendScore.set(seed, (topicTrendScore.get(seed) ?? 0) + momentum);
      if (isCantinaIncident(incident)) {
        cantinaTopicCoverage.set(seed, (cantinaTopicCoverage.get(seed) ?? 0) + 1);
      }
    }
  }

  const topics = Array.from(topicTrendScore.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic)
    .slice(0, 6);

  const opportunityTopics = Array.from(topicTrendScore.entries())
    .map(([topic, score]) => ({
      topic,
      score,
      count: topicCounts.get(topic) ?? 0,
      cantinaCount: cantinaTopicCoverage.get(topic) ?? 0,
      gapScore: score * Math.max(1, (topicCounts.get(topic) ?? 0) - (cantinaTopicCoverage.get(topic) ?? 0)),
    }))
    .filter((row) => row.count >= 2 && row.cantinaCount <= 1)
    .sort((a, b) => b.gapScore - a.gapScore)
    .slice(0, 3);

  const digestAngles = opportunityTopics.map((row) =>
    `Angle to own: ${row.topic} (${row.count} AHackaday signals vs ${row.cantinaCount} Cantina hits).`);

  const digestStories = recent
    .slice()
    .sort((a, b) => (b.socialMentions24h ?? 0) - (a.socialMentions24h ?? 0))
    .slice(0, 3)
    .map((incident) => `Daily digest seed: ${incident.title}`);

  const rankedTopicList = Array.from(topicCounts.entries())
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

  const recommendations = [
    ...(openRecommendations.length > 0 ? openRecommendations : fallbackRecommendations),
    ...digestAngles,
  ].slice(0, 5);

  const criticalCount = recent.filter((incident) => incident.severity === "critical").length;
  const zeroDayCount = recent.filter((incident) => /zero-day|0-day/i.test(`${incident.title} ${incident.summary}`)).length;
  const geoMix = new Set(recent.map((incident) => incident.category.toLowerCase())).size;
  const cantinaStories = recent.filter((incident) => isCantinaIncident(incident)).length;
  const nonCantinaStories = Math.max(0, recent.length - cantinaStories);
  const feedback = [
    `Coverage mix: ${geoMix} topic clusters across ${recent.length} recent stories (${cantinaStories} Cantina / ${nonCantinaStories} non-Cantina).`,
    `Priority pressure: ${criticalCount} critical incidents and ${zeroDayCount} zero-day mentions this cycle.`,
    "Add explicit 'answer in one sentence' blocks near the top of each brief to improve AI citation likelihood.",
    ...digestStories,
  ];

  return {
    generated_at: new Date().toISOString(),
    week_of: weekStartIso(now),
    topics: topics.length > 0 ? topics : rankedTopicList,
    recommendations,
    feedback,
  };
}
