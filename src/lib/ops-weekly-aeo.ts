import type { Incident, Severity } from "@/lib/incident-types";

export type DigestConfidenceLevel = "high" | "medium" | "low";

/** One ranked content opportunity — V2 structured output. */
export type DigestOpportunityItem = {
  opportunity_title: string;
  why_now: string;
  recommended_angle: string;
  expected_impact: string;
  confidence: DigestConfidenceLevel;
  evidence_refs: string[];
};

export type DigestRecommendationItem = {
  action: string;
  expected_impact: string;
  confidence: DigestConfidenceLevel;
  /** Where this line was derived from for transparency. */
  source: "feed_digest" | "grace_workspace";
};

export type DigestDataQuality = {
  /** 0–100 rough completeness of structured fields. */
  completeness: number;
  notes?: string[];
};

export type GraceOpsDailyDigest = {
  version: 2;
  digest_date: string;
  generated_at: string;
  /** Editorial themes (no severity tokens as standalone themes). */
  themes: string[];
  /** One line describing severity / attention (optional). */
  signals_summary: string | null;
  opportunity_items: DigestOpportunityItem[];
  recommendation_items: DigestRecommendationItem[];
  feedback: string[];
  /** Legacy flat lists for API consumers — derived from structured fields. */
  topics: string[];
  opportunities: string[];
  recommendations: string[];
  supporting_metrics?: {
    north_star?: number;
    answer_inclusion?: number;
    freshness?: number;
    open_actions?: number;
  };
};

const SEVERITY_SET = new Set<string>(["critical", "high", "medium", "low"]);

/** @deprecated Prefer GraceOpsDailyDigest */
export type DailyAeoDigest = GraceOpsDailyDigest;

function toTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 4);
}

function isCantinaIncident(incident: Incident): boolean {
  return incident.sources.some((source) => source.toLowerCase().includes("cantina.security"));
}

/** Seeds used for thematic clustering — excludes raw severity buckets. */
function thematicSeedsForIncident(incident: Incident): string[] {
  return Array.from(
    new Set<string>([
      incident.category.toLowerCase(),
      ...toTokens(incident.title).slice(0, 6),
      ...toTokens(incident.summary).slice(0, 5),
    ]),
  ).filter((t) => !SEVERITY_SET.has(t));
}

function toDigestDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function humanizeThemeToken(token: string): string {
  const t = token.trim().toLowerCase();
  if (!t) return token;
  return t.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Token bag key for dedupe / diversity. */
function tokenSignature(text: string): string {
  const tokens = new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((w) => w.length >= 4 && !SEVERITY_SET.has(w)),
  );
  return Array.from(tokens).sort().join("|");
}

function confidenceFromGap(row: {
  count: number;
  cantinaCount: number;
  momentum: number;
}): DigestConfidenceLevel {
  if (row.cantinaCount === 0 && row.count >= 3 && row.momentum >= 40) return "high";
  if (row.cantinaCount <= 1 && row.count >= 2) return "medium";
  return "low";
}

function pickEvidenceRefsForSeed(recent: Incident[], seed: string, limit: number): string[] {
  const refs = new Set<string>();
  const seedLower = seed.toLowerCase();
  for (const incident of recent) {
    const hay = `${incident.title} ${incident.summary} ${incident.category}`.toLowerCase();
    if (!hay.includes(seedLower) && incident.category.toLowerCase() !== seedLower) continue;
    for (const s of incident.sources.slice(0, 2)) {
      if (/^https?:\/\//i.test(s)) refs.add(s);
    }
    if (refs.size >= limit) break;
  }
  return Array.from(refs).slice(0, limit);
}

function diversityPick<T extends { opportunity_title: string }>(items: T[], limit: number): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const sig = tokenSignature(item.opportunity_title);
    if (!sig || seen.has(sig)) continue;
    seen.add(sig);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function formatOpportunityOneLiner(item: DigestOpportunityItem): string {
  return `${item.opportunity_title} — ${item.why_now.replace(/\.$/, "")}.`;
}

function formatRecommendationOneLiner(item: DigestRecommendationItem): string {
  return `${item.action} (${item.expected_impact})`;
}

export function summarizeSeverityMix(recent: Incident[]): string | null {
  if (recent.length === 0) return null;
  const counts: Partial<Record<Severity, number>> = {};
  for (const sev of ["critical", "high", "medium", "low"] as const) {
    counts[sev] = recent.filter((i) => i.severity === sev).length;
  }
  const parts = (["critical", "high", "medium", "low"] as const)
    .filter((sev) => (counts[sev] ?? 0) > 0)
    .map((sev) => `${sev}: ${counts[sev]}`);
  if (parts.length === 0) return null;
  return `Severity mix (${recent.length} recent stories): ${parts.join(", ")}.`;
}

/** Parse unknown JSON into validated opportunity items (Grace V2 responses). */
export function parseDigestOpportunityItems(raw: unknown): DigestOpportunityItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DigestOpportunityItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const title = typeof o.opportunity_title === "string" ? o.opportunity_title.trim() : "";
    if (!title) continue;
    const confidenceRaw = typeof o.confidence === "string" ? o.confidence.toLowerCase() : "medium";
    const confidence = confidenceRaw === "high" || confidenceRaw === "low" ? confidenceRaw : "medium";
    const evidence = Array.isArray(o.evidence_refs)
      ? o.evidence_refs.filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];
    out.push({
      opportunity_title: title,
      why_now: typeof o.why_now === "string" && o.why_now.trim() ? o.why_now.trim() : "Strong feed signal vs weaker Cantina competitor coverage.",
      recommended_angle: typeof o.recommended_angle === "string" && o.recommended_angle.trim()
        ? o.recommended_angle.trim()
        : `Publish authoritative answer-first guidance for ${humanizeThemeToken(title)}.`,
      expected_impact: typeof o.expected_impact === "string" && o.expected_impact.trim()
        ? o.expected_impact.trim()
        : "Improves answer-inclusion likelihood in AI summaries.",
      confidence,
      evidence_refs: evidence.slice(0, 6),
    });
  }
  return out;
}

/** Parse Grace / client recommendation objects. */
export function parseDigestRecommendationItems(raw: unknown): DigestRecommendationItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DigestRecommendationItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const action = typeof o.action === "string" ? o.action.trim() : "";
    if (!action) continue;
    const sourceRaw = typeof o.source === "string" ? o.source : "grace_workspace";
    const source = sourceRaw === "feed_digest" ? "feed_digest" : "grace_workspace";
    const confidenceRaw = typeof o.confidence === "string" ? o.confidence.toLowerCase() : "medium";
    const confidence = confidenceRaw === "high" || confidenceRaw === "low" ? confidenceRaw : "medium";
    out.push({
      action,
      expected_impact: typeof o.expected_impact === "string" && o.expected_impact.trim()
        ? o.expected_impact.trim()
        : "Better citation-worthy structure for AI retrieval.",
      confidence,
      source,
    });
  }
  return out;
}

/**
 * Normalize legacy flat-string digest fragments into structured items.
 */
export function legacyStringsToGraceOpsDailyDigest(part: {
  digest_date?: string;
  generated_at?: string;
  themes?: string[];
  topics?: string[];
  signals_summary?: string | null;
  opportunities?: string[];
  recommendations?: string[];
  feedback?: string[];
  version?: number;
}): GraceOpsDailyDigest {
  const digest_date = typeof part.digest_date === "string" ? part.digest_date : toDigestDate();
  const generated_at = typeof part.generated_at === "string" ? part.generated_at : new Date().toISOString();
  const themes = Array.isArray(part.themes) && part.themes.length > 0
    ? part.themes
    : (Array.isArray(part.topics) ? part.topics.filter((t) => !SEVERITY_SET.has(t.toLowerCase())) : []);
  const opportunity_items: DigestOpportunityItem[] = (part.opportunities ?? []).map((line) => ({
    opportunity_title: line.split(/[—:–-]/)[0]?.trim() || line.slice(0, 80),
    why_now: line.includes("—") ? line.split("—").slice(1).join("—").trim() : "Feed coverage gap vs Cantina.",
    recommended_angle: `Ship an answer-first explainer with comparison table for ${humanizeThemeToken(line.split(":")[0] || "this theme")}.`,
    expected_impact: "Improves topical authority for AI answer engines.",
    confidence: "medium" as const,
    evidence_refs: [],
  }));
  const recommendation_items: DigestRecommendationItem[] = (part.recommendations ?? []).map((line) => ({
    action: line.replace(/\s*\([^)]*\)\s*$/, "").trim() || line,
    expected_impact: line.includes("(") && line.includes(")")
      ? line.replace(/^.*\(([^)]+)\).*$/, "$1")
      : "Clearer retrieval paths for models.",
    confidence: "medium" as const,
    source: "grace_workspace" as const,
  }));
  const feedback = Array.isArray(part.feedback) ? part.feedback : [];
  const brief: GraceOpsDailyDigest = {
    version: 2,
    digest_date,
    generated_at,
    themes,
    signals_summary: typeof part.signals_summary === "string" ? part.signals_summary : null,
    opportunity_items,
    recommendation_items,
    feedback,
    topics: themes,
    opportunities: opportunity_items.map(formatOpportunityOneLiner),
    recommendations: recommendation_items.map(formatRecommendationOneLiner),
  };
  return brief;
}

function finalizeDigestShell(partial: GraceOpsDailyDigest): GraceOpsDailyDigest {
  const opportunity_items = diversityPick(partial.opportunity_items, 5);
  const recommendation_items = partial.recommendation_items.slice(0, 6);
  return {
    version: 2,
    digest_date: partial.digest_date,
    generated_at: partial.generated_at,
    themes: partial.themes.slice(0, 8),
    signals_summary: partial.signals_summary,
    opportunity_items,
    recommendation_items,
    feedback: partial.feedback.slice(0, 12),
    topics: partial.themes.slice(0, 8),
    opportunities: opportunity_items.map(formatOpportunityOneLiner),
    recommendations: recommendation_items.map(formatRecommendationOneLiner),
    ...(partial.supporting_metrics ? { supporting_metrics: partial.supporting_metrics } : {}),
  };
}

/** Map Grace `/api/ops/weekly-aeo` JSON body into unified V2 digest. */
export function rawGraceWeeklyAeoPayloadToGraceOpsDigest(response: Record<string, unknown>): GraceOpsDailyDigest {
  const digest_date = typeof response.digest_date === "string"
    ? response.digest_date
    : (typeof response.week_of === "string" ? response.week_of : toDigestDate());
  const generated_at = typeof response.generated_at === "string" ? response.generated_at : new Date().toISOString();

  let opportunity_items = parseDigestOpportunityItems(response.opportunity_items);
  let recommendation_items = parseDigestRecommendationItems(response.recommendation_items);

  const themesRaw = Array.isArray(response.themes)
    ? response.themes.filter((v): v is string => typeof v === "string")
    : [];
  const topicsRaw = Array.isArray(response.topics)
    ? response.topics.filter((v): v is string => typeof v === "string")
    : [];

  const feedback = Array.isArray(response.feedback)
    ? response.feedback.filter((v): v is string => typeof v === "string")
    : [];

  const signals_summary = typeof response.signals_summary === "string"
    ? response.signals_summary
    : typeof response.signal_summary === "string"
      ? response.signal_summary
      : null;

  const supporting_metrics = (response.supporting_metrics && typeof response.supporting_metrics === "object")
    ? response.supporting_metrics as GraceOpsDailyDigest["supporting_metrics"]
    : undefined;

  if (!opportunity_items.length) {
    const stringOpps = Array.isArray(response.opportunities)
      ? response.opportunities.filter((v): v is string => typeof v === "string")
      : [];
    if (stringOpps.length > 0) {
      opportunity_items = legacyStringsToGraceOpsDailyDigest({
        digest_date,
        generated_at,
        themes: themesRaw.length ? themesRaw : topicsRaw.filter((t) => !SEVERITY_SET.has(t.toLowerCase())),
        opportunities: stringOpps,
        feedback,
      }).opportunity_items;
    }
  }

  if (!recommendation_items.length) {
    const stringRecs = Array.isArray(response.recommendations)
      ? response.recommendations.filter((v): v is string => typeof v === "string")
      : [];
    if (stringRecs.length > 0) {
      recommendation_items = legacyStringsToGraceOpsDailyDigest({
        digest_date,
        generated_at,
        themes: themesRaw.length ? themesRaw : topicsRaw.filter((t) => !SEVERITY_SET.has(t.toLowerCase())),
        recommendations: stringRecs,
        feedback,
      }).recommendation_items.map((r) => ({
        ...r,
        source: "grace_workspace" as const,
      }));
    }
  }

  const themes = themesRaw.length > 0
    ? themesRaw.map((t) => t.trim().toLowerCase()).filter(Boolean)
    : topicsRaw.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0 && !SEVERITY_SET.has(t));

  const briefPartial: GraceOpsDailyDigest = {
    version: 2,
    digest_date,
    generated_at,
    themes,
    signals_summary,
    opportunity_items,
    recommendation_items,
    feedback,
    topics: themes,
    opportunities: [],
    recommendations: [],
    ...(supporting_metrics ? { supporting_metrics } : {}),
  };

  return finalizeDigestShell(briefPartial);
}

function computeDataQuality(brief: GraceOpsDailyDigest): DigestDataQuality {
  let score = 0;
  const notes: string[] = [];
  if (brief.themes.length > 0) score += 20;
  else notes.push("no themes");
  if (brief.opportunity_items.length >= 1) score += 35;
  else notes.push("no opportunities");
  if (brief.recommendation_items.length >= 1) score += 25;
  else notes.push("no recommendation items");
  if (brief.feedback.length >= 1) score += 20;
  else notes.push("no feedback");
  const rich = brief.opportunity_items.filter(
    (o) => o.evidence_refs.length > 0 && o.confidence === "high",
  ).length;
  if (rich >= 1) score = Math.min(100, score + 5);
  return { completeness: Math.min(100, score), notes: notes.length ? notes : undefined };
}

export type MergeDigestResult = {
  brief: GraceOpsDailyDigest;
  source_mode: "local_fallback" | "grace_workspace" | "hybrid";
  data_quality: DigestDataQuality;
};

function dedupeOpportunitiesKeepOrder(preferred: DigestOpportunityItem[], fallback: DigestOpportunityItem[]): DigestOpportunityItem[] {
  const seen = new Set<string>();
  const out: DigestOpportunityItem[] = [];
  for (const item of [...preferred, ...fallback]) {
    const key = tokenSignature(item.opportunity_title) || item.opportunity_title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return diversityPick(out, 8);
}

function dedupeRecommendationsKeepOrder(preferred: DigestRecommendationItem[], fallback: DigestRecommendationItem[]): DigestRecommendationItem[] {
  const seen = new Set<string>();
  const out: DigestRecommendationItem[] = [];
  for (const item of [...preferred, ...fallback]) {
    const key = tokenSignature(item.action) || item.action.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 8);
}

/**
 * Local-strong merge: always includes feed digest; Grace items deduped in front when present.
 */
export function mergeGraceAndLocalDigests(input: {
  local: GraceOpsDailyDigest;
  grace: GraceOpsDailyDigest | null;
}): MergeDigestResult {
  const { local, grace } = input;
  const localFinal = finalizeDigestShell(local);

  if (!grace) {
    return {
      brief: localFinal,
      source_mode: "local_fallback",
      data_quality: computeDataQuality(localFinal),
    };
  }

  function graceAddsContent(g: GraceOpsDailyDigest): boolean {
    return g.opportunity_items.length > 0
      || g.recommendation_items.length > 0
      || g.opportunities.length > 0
      || g.recommendations.length > 0
      || g.feedback.length > 0;
  }

  const graceAdds = graceAddsContent(grace);
  const graceFinal = finalizeDigestShell(grace);

  if (!graceAdds) {
    return {
      brief: localFinal,
      source_mode: "local_fallback",
      data_quality: computeDataQuality(localFinal),
    };
  }

  const graceOppsPref = graceFinal.opportunity_items.length > 0
    ? graceFinal.opportunity_items
    : legacyStringsToGraceOpsDailyDigest({
      opportunities: grace.opportunities,
      digest_date: grace.digest_date,
      generated_at: grace.generated_at,
      themes: grace.themes,
      feedback: [],
    }).opportunity_items;
  const graceRecsPref = graceFinal.recommendation_items.length > 0
    ? graceFinal.recommendation_items.map((r) => ({ ...r, source: "grace_workspace" as const }))
    : legacyStringsToGraceOpsDailyDigest({
      recommendations: grace.recommendations,
      digest_date: grace.digest_date,
      generated_at: grace.generated_at,
      themes: grace.themes,
      feedback: [],
    }).recommendation_items.map((r) => ({ ...r, source: "grace_workspace" as const }));

  const mergedOpportunities = dedupeOpportunitiesKeepOrder(graceOppsPref, localFinal.opportunity_items);
  const mergedRecsAll = dedupeRecommendationsKeepOrder(graceRecsPref, localFinal.recommendation_items);
  const graceRecDedup = mergedRecsAll.filter((r) => r.source === "grace_workspace");
  const localRecDedup = mergedRecsAll.filter((r) => r.source === "feed_digest");
  const mergedRecsOrdered = [...graceRecDedup, ...localRecDedup].slice(0, 6);

  const themesMerged = localFinal.themes.length > 0 ? localFinal.themes : graceFinal.themes;
  const signalsMerged = localFinal.signals_summary ?? graceFinal.signals_summary;

  const supporting = graceFinal.supporting_metrics ?? localFinal.supporting_metrics;

  const brief = finalizeDigestShell({
    ...localFinal,
    digest_date: localFinal.digest_date,
    themes: themesMerged.slice(0, 8),
    signals_summary: signalsMerged,
    opportunity_items: diversityPick(mergedOpportunities, 5),
    recommendation_items: mergedRecsOrdered,
    feedback: Array.from(new Set([...graceFinal.feedback, ...localFinal.feedback])).slice(0, 12),
    generated_at: new Date().toISOString(),
    ...(supporting ? { supporting_metrics: supporting } : {}),
  });

  return {
    brief,
    source_mode: "hybrid",
    data_quality: computeDataQuality(brief),
  };
}

export function buildDailyAeoDigest(input: {
  incidents: Incident[];
  recommendations?: Array<{ title?: string; status?: string }>;
}): GraceOpsDailyDigest {
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - (1000 * 60 * 60 * 24 * 3));
  const recent = input.incidents.filter((incident) => new Date(incident.date).getTime() >= lookbackStart.getTime());

  if (recent.length === 0) {
    const playbook: DigestRecommendationItem[] = [
      {
        action: "Run ingest or widen the feed window so Grace Ops has recent stories to compare.",
        expected_impact: "Restores actionable daily gap detection.",
        confidence: "high",
        source: "feed_digest",
      },
      {
        action: "Publish one anchor explainer on your highest-value category with answer-first structure.",
        expected_impact: "Builds baseline retrieval even with thin feed data.",
        confidence: "medium",
        source: "feed_digest",
      },
    ];
    return finalizeDigestShell({
      version: 2,
      digest_date: toDigestDate(now),
      generated_at: now.toISOString(),
      themes: ["feed"],
      signals_summary: null,
      opportunity_items: [
        {
          opportunity_title: "Feed coverage gap",
          why_now: "No incidents fell inside the 72-hour pulse window.",
          recommended_angle: "Refresh ingest sources, then rerun this panel after new items land.",
          expected_impact: "Re-enables competitor gap detection.",
          confidence: "high",
          evidence_refs: [],
        },
      ],
      recommendation_items: playbook,
      feedback: [
        "No qualifying stories in-window — double-check ingest jobs and clock skew before sharing this digest.",
      ],
      topics: ["feed"],
      opportunities: [],
      recommendations: [],
    });
  }

  const topicCounts = new Map<string, number>();
  const topicTrendScore = new Map<string, number>();
  const cantinaTopicCoverage = new Map<string, number>();

  for (const incident of recent) {
    const seeds = thematicSeedsForIncident(incident);
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

  const themesRanked = Array.from(topicTrendScore.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic);

  const opportunityRows = Array.from(topicTrendScore.entries())
    .map(([topic, score]) => ({
      topic,
      score,
      count: topicCounts.get(topic) ?? 0,
      cantinaCount: cantinaTopicCoverage.get(topic) ?? 0,
      momentum: score,
      gapScore: score * Math.max(1, (topicCounts.get(topic) ?? 0) - (cantinaTopicCoverage.get(topic) ?? 0)),
    }))
    .filter((row) => row.count >= 2 && row.cantinaCount <= 1)
    .sort((a, b) => b.gapScore - a.gapScore);

  const digestStories = recent
    .slice()
    .sort((a, b) => (b.socialMentions24h ?? 0) - (a.socialMentions24h ?? 0))
    .slice(0, 3)
    .map((incident) => `Top story momentum: ${incident.title}`);

  const fallbackThemes = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic)
    .filter((t) => !SEVERITY_SET.has(t));

  const themes = (themesRanked.length > 0 ? themesRanked : fallbackThemes).slice(0, 6);

  const opportunity_candidates: DigestOpportunityItem[] = opportunityRows.slice(0, 12).map((row) => {
    const conf = confidenceFromGap({
      count: row.count,
      cantinaCount: row.cantinaCount,
      momentum: row.momentum,
    });
    const refs = pickEvidenceRefsForSeed(recent, row.topic, 3);
    return {
      opportunity_title: humanizeThemeToken(row.topic),
      why_now: `${humanizeThemeToken(row.topic)} shows ${row.count} AHackaday stories versus ${row.cantinaCount} Cantina match in the pulse window.`,
      recommended_angle:
        "Ship an answer-first explainer covering decisions, timelines, mitigations — link to authoritative sources.",
      expected_impact: "Higher answer-inclusion likelihood in AI overviews.",
      confidence: conf,
      evidence_refs: refs,
    };
  });

  const fallbackOpportunity: DigestOpportunityItem[] =
    themes.length > 0
      ? diversityPick(themes.slice(0, 3).map((t) => ({
        opportunity_title: humanizeThemeToken(t),
        why_now: "Maintain daily authority on recurring reader intent while competitors stay quiet.",
        recommended_angle:
          `Add a succinct FAQ aligned to '${humanizeThemeToken(t)}' with explicit comparison callouts.`,
        expected_impact: "Steady retrieval coverage for evergreen queries.",
        confidence: "low" as const,
        evidence_refs: pickEvidenceRefsForSeed(recent, t, 2),
      })), 5)
      : [];

  const opportunity_items = diversityPick(
    opportunity_candidates.length > 0 ? opportunity_candidates : fallbackOpportunity,
    5,
  );

  const openRecommendations = (input.recommendations ?? [])
    .filter((rec) => (rec.status ?? "todo") !== "done")
    .map((rec) => rec.title?.trim())
    .filter((title): title is string => Boolean(title));

  const playbook: DigestRecommendationItem[] = [
    {
      action: "Publish FAQ cluster with answer-first headings for each urgent question tied to today's themes.",
      expected_impact: "Improves direct-answer quoting in AI results.",
      confidence: "medium",
      source: "feed_digest",
    },
    {
      action: "Publish a mitigation comparison brief (effort vs impact) anchored to trending evidence.",
      expected_impact: "Captures comparative queries models favor.",
      confidence: "medium",
      source: "feed_digest",
    },
    {
      action: "Refresh strongest posts with fresh 'what changed' bullets dated today.",
      expected_impact: "Boosts freshness and recrawl priority.",
      confidence: "medium",
      source: "feed_digest",
    },
  ];

  const fromOpen: DigestRecommendationItem[] = openRecommendations.slice(0, 2).map((title) => ({
    action: title,
    expected_impact: "Executes backlog actions tied to live workspace guidance.",
    confidence: "medium",
    source: "feed_digest",
  }));

  const recommendation_items = dedupeRecommendationsKeepOrder(fromOpen, playbook).slice(0, 6);

  const criticalCount = recent.filter((incident) => incident.severity === "critical").length;
  const zeroDayCount = recent.filter((incident) => /zero-day|0-day/i.test(`${incident.title} ${incident.summary}`)).length;
  const geoMix = new Set(recent.map((incident) => incident.category.toLowerCase())).size;
  const cantinaStories = recent.filter((incident) => isCantinaIncident(incident)).length;
  const nonCantinaStories = Math.max(0, recent.length - cantinaStories);

  const feedback = [
    `Coverage mix: ${geoMix} theme clusters across ${recent.length} recent stories (${cantinaStories} Cantina-linked / ${nonCantinaStories} other).`,
    `Priority narrative: ${criticalCount} tagged critical and ${zeroDayCount} explicit zero-day references in-window.`,
    "Place a blunt one-sentence answer in the opening 120 words and mirror it in headings for query intent alignment.",
    ...digestStories,
  ];

  const signals_summary = summarizeSeverityMix(recent);

  const partial: GraceOpsDailyDigest = {
    version: 2,
    digest_date: toDigestDate(now),
    generated_at: now.toISOString(),
    themes,
    signals_summary,
    opportunity_items,
    recommendation_items,
    feedback,
    topics: themes,
    opportunities: [],
    recommendations: [],
  };

  return finalizeDigestShell(partial);
}

/** @deprecated Backward-compat alias */
export const buildWeeklyAeoBrief = buildDailyAeoDigest;
