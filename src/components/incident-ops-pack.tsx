"use client";

import { useEffect, useMemo, useState } from "react";

type OpsPackProps = {
  incident: {
    slug: string;
    canonicalId?: string;
    title: string;
    category: string;
    severity: string;
    summary: string;
    iocs: string[];
    sources: string[];
    evidence: {
      cves: string[];
      packages: string[];
    };
  };
  incidentKey: string;
  incidentUrl: string;
  initialGraceState?: GraceState | null;
};

type GraceState = {
  kpis: {
    north_star: number;
    answer_inclusion: number;
    freshness: number;
    open_actions: number;
  };
  top_recommendation: {
    id: string;
    title: string;
    status: string;
  } | null;
  recommendation_counts_by_status: Record<string, number>;
  latest_run: {
    run_id: string;
    status: "queued" | "started" | "completed" | "failed";
    created_at: string;
    origin: string;
  } | null;
  stale: boolean;
};

type DigestOpportunityItem = {
  opportunity_title: string;
  why_now: string;
  recommended_angle: string;
  expected_impact: string;
  confidence: string;
  evidence_refs: string[];
};

type DigestRecommendationItem = {
  action: string;
  expected_impact: string;
  confidence: string;
  source: string;
};

type DigestDataQuality = {
  completeness: number;
  notes?: string[];
};

type GraceOpsDailyDigest = {
  version: number;
  digest_date: string;
  generated_at: string;
  themes: string[];
  signals_summary: string | null;
  opportunity_items: DigestOpportunityItem[];
  recommendation_items: DigestRecommendationItem[];
  feedback: string[];
};

function humanizeTheme(token: string): string {
  const t = token.trim().toLowerCase();
  if (!t) return token;
  return t.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sourceBadgeLabel(source: string): string {
  if (source === "grace_workspace") return "grace workspace";
  return "feed digest";
}

function formatOpportunityCopyBlock(item: DigestOpportunityItem): string {
  const refs = item.evidence_refs.length > 0 ? `\nEvidence: ${item.evidence_refs.join(", ")}` : "";
  return [
    `${item.opportunity_title}`,
    `Why now: ${item.why_now}`,
    `Angle: ${item.recommended_angle}`,
    `Impact: ${item.expected_impact}`,
    `Confidence: ${item.confidence}`,
  ].join("\n") + refs;
}

function formatRecommendationCopyBlock(item: DigestRecommendationItem): string {
  return `${item.action}\nImpact: ${item.expected_impact}\nSource: ${sourceBadgeLabel(item.source)} · Confidence: ${item.confidence}`;
}

export function IncidentOpsPack({ incident, incidentKey, initialGraceState = null }: OpsPackProps) {
  const [graceState, setGraceState] = useState<GraceState | null>(initialGraceState);
  const [dailyDigest, setDailyDigest] = useState<GraceOpsDailyDigest | null>(null);
  const [sourceMode, setSourceMode] = useState<string | null>(null);
  const [dataQuality, setDataQuality] = useState<DigestDataQuality | null>(null);

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API can fail in restricted contexts.
    }
  }

  const graceEnabled = process.env.NEXT_PUBLIC_OPS_PACK_GRACE_ENABLED === "1";
  const graceStatusLabel = !graceEnabled
    ? "grace disabled"
    : !graceState
      ? "grace connecting"
      : graceState.top_recommendation
        ? "incident guidance live"
        : "grace connected · no incident task yet";

  const aeoNorthStar = graceState?.kpis.north_star ?? 0;
  const answerInclusion = graceState?.kpis.answer_inclusion ?? 0;
  const freshness = graceState?.kpis.freshness ?? 0;
  const recommendationBacklog = graceState?.kpis.open_actions ?? 0;
  const dailyHealth = Math.round((freshness + answerInclusion) / 2);

  const themeLabels = (dailyDigest?.themes ?? [incident.category]).slice(0, 4).map(humanizeTheme);
  const signalsLine = dailyDigest?.signals_summary ?? null;

  const topOpportunities = (dailyDigest?.opportunity_items ?? []).slice(0, 3);
  const topRecommendations = (dailyDigest?.recommendation_items ?? []).slice(0, 3);
  const rankFeedback = (dailyDigest?.feedback ?? []).slice(0, 3);

  const digestSourceLabel = sourceMode === "hybrid"
    ? "grace + feed digest"
    : sourceMode === "local_fallback"
      ? "feed digest"
      : sourceMode === "grace_workspace"
        ? "grace workspace"
        : "digest";

  const quickStats = useMemo(
    () => [
      `Digest date: ${dailyDigest?.digest_date ?? "—"}`,
      `Data completeness: ${dataQuality?.completeness ?? "—"}${typeof dataQuality?.completeness === "number" ? "/100" : ""}`,
      `Open incident tasks: ${recommendationBacklog}`,
    ],
    [dailyDigest, dataQuality, recommendationBacklog],
  );

  async function refreshGraceState() {
    if (!graceEnabled) return;
    try {
      const response = await fetch(`/api/ops/incident-state?incident_key=${encodeURIComponent(incidentKey)}`);
      if (!response.ok) return;
      const data = await response.json() as { ok: boolean; state?: GraceState };
      if (data.ok && data.state) {
        setGraceState(data.state);
      }
    } catch {
      // Grace fetch is best-effort for UI continuity.
    }
  }

  async function refreshDailyDigest() {
    if (!graceEnabled) return;
    try {
      const response = await fetch("/api/ops/weekly-aeo");
      if (!response.ok) return;
      const data = await response.json() as {
        ok: boolean;
        brief?: GraceOpsDailyDigest;
        source_mode?: string;
        data_quality?: DigestDataQuality;
      };
      if (data.ok && data.brief) {
        setDailyDigest(data.brief);
        if (typeof data.source_mode === "string") setSourceMode(data.source_mode);
        if (data.data_quality) setDataQuality(data.data_quality);
      }
    } catch {
      // best-effort only
    }
  }

  useEffect(() => {
    if (!graceEnabled) return;
    const timer = setTimeout(() => {
      void refreshGraceState();
      void refreshDailyDigest();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentKey, graceEnabled]);

  return (
    <section className="ops">
      <div className="ops__hd">
        <div className="ops__hd__l">
          <div>
            <div className="ops__name">Grace Ops</div>
            <div className="ops__sub">daily AEO / GEO opportunities from your feed (with optional Grace workspace merge)</div>
          </div>
        </div>
        <div className="ops__hd__r">
          <span className="ops__fresh"><span className="dot" /> {graceState?.stale ? "stale" : "fresh"}</span>
          <span className="ops__fresh">{graceStatusLabel}</span>
          <span className="ops__fresh">{digestSourceLabel}</span>
          {graceEnabled && graceState ? (
            <>
              <span className="ops__fresh" title="Blend of freshness and answer-inclusion for this incident">
                page score {dailyHealth}/100
              </span>
              <span className="ops__fresh">
                backlog {recommendationBacklog > 6 ? "elevated" : "normal"}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="ops__lanes">
        <div className="lane">
          <div className="lane__hd">
            <div className="lane__hd__l">
              <div className="lane__num">1</div>
              <div>
                <div className="lane__title">Top opportunities today</div>
                <div className="lane__hint">themes with the clearest gap vs Cantina + social momentum</div>
              </div>
            </div>
            <div className="lane__count"><b>{topOpportunities.length}</b> ranked</div>
          </div>
          <div className="rule-help">
            <span>!</span>
            <span>
              <b>Themes:</b> {themeLabels.join(" · ")}
              {signalsLine ? <><br /><b>Signals:</b> {signalsLine}</> : null}
            </span>
            <button
              type="button"
              className="btn-quiet"
              onClick={() => void copyText(topOpportunities.map(formatOpportunityCopyBlock).join("\n\n"))}
            >
              copy
            </button>
          </div>
          <article className="rule-card">
            <div className="rule-card__body">
              {dailyDigest === null ? (
                "Loading today's digest..."
              ) : topOpportunities.length > 0 ? (
                topOpportunities
                  .map((item, idx) =>
                    `${idx + 1}. ${item.opportunity_title} · ${item.confidence} confidence\n   ${item.why_now}\n   Angle: ${item.recommended_angle}\n   Impact: ${item.expected_impact}${
                      item.evidence_refs.length ? `\n   Refs: ${item.evidence_refs.slice(0, 2).join(", ")}` : ""
                    }`,
                  )
                  .join("\n\n")
              ) : (
                "No ranked gap yet — widen ingest or revisit after new stories publish."
              )}
            </div>
            <div className="rule-card__foot">
              <div className="rule-readiness">
                answer inclusion {answerInclusion}/100
                <span className="bar"><i style={{ width: `${Math.max(8, Math.min(100, answerInclusion))}%` }} /></span>
              </div>
            </div>
          </article>
        </div>

        <div className="lane">
          <div className="lane__hd">
            <div className="lane__hd__l">
              <div className="lane__num">2</div>
              <div>
                <div className="lane__title">Recommended actions</div>
                <div className="lane__hint">anchored publishing moves for today</div>
              </div>
            </div>
            <div className="lane__count"><b>{topRecommendations.length}</b> actions</div>
          </div>
          <div className="rule-help">
            <span>#</span>
            <span><b>Editorial anchor:</b> {incident.title}</span>
            <button
              type="button"
              className="btn-quiet"
              onClick={() => void copyText(topRecommendations.map(formatRecommendationCopyBlock).join("\n\n"))}
            >
              copy
            </button>
          </div>
          <article className="rule-card">
            <div className="rule-card__hd">
              <div className="rule-card__hd__l">
                <span className="rule-kind">publish queue</span>
                <span className="rule-status">{digestSourceLabel}</span>
              </div>
            </div>
            <div className="rule-card__body">
              {dailyDigest === null ? (
                "Loading actions..."
              ) : topRecommendations.length > 0 ? (
                topRecommendations
                  .map(
                    (item, idx) =>
                      `${idx + 1}. ${item.action}\n   Impact: ${item.expected_impact}\n   ${sourceBadgeLabel(item.source)} · ${item.confidence} confidence`,
                  )
                  .join("\n\n")
              ) : (
                "Draft one FAQ cluster and one comparison brief using the themes column."
              )}
            </div>
          </article>
        </div>

        <div className="lane">
          <div className="lane__hd">
            <div className="lane__hd__l">
              <div className="lane__num">3</div>
              <div>
                <div className="lane__title">Feedback to improve rank</div>
                <div className="lane__hint">structure + breadth signals editors can ship today</div>
              </div>
            </div>
            <div className="lane__count"><b>{rankFeedback.length}</b> notes</div>
          </div>
          <div className="rule-help">
            <span>!</span>
            <span><b>Operator:</b> {quickStats.join(" · ")}</span>
            <button type="button" className="btn-quiet" onClick={() => void copyText([...rankFeedback, ...quickStats].join("\n"))}>
              copy all
            </button>
          </div>
          <div className="rule-cards">
            <article className="rule-card">
              <div className="rule-card__hd">
                <div className="rule-card__hd__l">
                  <span className="rule-kind">content feedback</span>
                  <span className="rule-status">{themeLabels.length} themes</span>
                </div>
                <button type="button" className="btn-quiet" onClick={() => void copyText(rankFeedback.join("\n"))}>copy</button>
              </div>
              <div className="rule-card__body">
                {rankFeedback.length > 0
                  ? rankFeedback.map((line) => `- ${line}`).join("\n")
                  : "Lead with a one-sentence answer, then support with bullets and dated change notes."}
              </div>
              <div className="rule-card__foot">
                <div className="rule-readiness">
                  rank readiness {aeoNorthStar}/100
                  <span className="bar"><i style={{ width: `${Math.max(8, Math.min(100, aeoNorthStar))}%` }} /></span>
                </div>
              </div>
            </article>

            <article className="rule-card">
              <div className="rule-card__hd">
                <div className="rule-card__hd__l">
                  <span className="rule-kind">digest quality</span>
                  <span className="rule-status">{digestSourceLabel}</span>
                </div>
                <button type="button" className="btn-quiet" onClick={() => void copyText(quickStats.join("\n"))}>copy</button>
              </div>
              <div className="rule-card__body">
                {quickStats.map((line) => `- ${line}`).join("\n")}
              </div>
              <div className="rule-card__foot">
                <div className="rule-readiness">
                  execution pressure ({recommendationBacklog} tasks)
                  <span className="bar"><i style={{ width: `${Math.max(8, Math.min(100, Math.min(recommendationBacklog * 12, 100)))}%` }} /></span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
