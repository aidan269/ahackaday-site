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

type DailyAeoDigest = {
  generated_at: string;
  digest_date: string;
  topics: string[];
  opportunities: string[];
  recommendations: string[];
  feedback: string[];
};

export function IncidentOpsPack({ incident, incidentKey, initialGraceState = null }: OpsPackProps) {
  const [graceState, setGraceState] = useState<GraceState | null>(initialGraceState);
  const [dailyDigest, setDailyDigest] = useState<DailyAeoDigest | null>(null);

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
        ? "grace recommendations live"
        : "grace connected • no recommendations yet";

  const aeoNorthStar = graceState?.kpis.north_star ?? 0;
  const answerInclusion = graceState?.kpis.answer_inclusion ?? 0;
  const recommendationBacklog = graceState?.kpis.open_actions ?? 0;

  const topTopics = (dailyDigest?.topics ?? [incident.category, incident.severity]).slice(0, 3);
  const topOpportunities = (dailyDigest?.opportunities ?? []).slice(0, 3);
  const topRecommendations = (dailyDigest?.recommendations ?? []).slice(0, 3);
  const rankFeedback = (dailyDigest?.feedback ?? []).slice(0, 3);

  const quickStats = useMemo(
    () => [
      `Digest date: ${dailyDigest?.digest_date ?? "today"}`,
      `Topics tracked today: ${dailyDigest?.topics.length ?? topTopics.length}`,
      `Open recommendation backlog: ${recommendationBacklog}`,
    ],
    [dailyDigest, recommendationBacklog, topTopics.length],
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
      const data = await response.json() as { ok: boolean; brief?: DailyAeoDigest };
      if (data.ok && data.brief) {
        setDailyDigest(data.brief);
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
            <div className="ops__sub">marketing analytics agent for AEO/GEO daily ranking opportunities</div>
          </div>
        </div>
        <div className="ops__hd__r">
          <span className="ops__fresh"><span className="dot" /> {graceState?.stale ? "stale" : "fresh"}</span>
          <span className="ops__fresh">{graceStatusLabel}</span>
          {graceEnabled && graceState ? (
            <>
              <span className="ops__fresh">daily health {Math.round((graceState.kpis.freshness + graceState.kpis.answer_inclusion) / 2)}</span>
              <span className="ops__fresh">trend {graceState.kpis.open_actions > 6 ? "backlog heavy" : "on track"}</span>
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
                <div className="lane__title">Top Opportunities Today</div>
                <div className="lane__hint">AEO/GEO content gaps to close in the next publishing cycle</div>
              </div>
            </div>
            <div className="lane__count"><b>{topOpportunities.length}</b> opportunities</div>
          </div>
          <div className="rule-help">
            <span>!</span>
            <span><b>Daily focus topics:</b> {topTopics.join(", ")}</span>
            <button type="button" className="btn-quiet" onClick={() => void copyText(topOpportunities.join("\n"))}>copy</button>
          </div>
          <article className="rule-card">
            <div className="rule-card__body">
              {topOpportunities.length > 0
                ? topOpportunities.map((line) => `- ${line}`).join("\n")
                : "No strong gap opportunities detected yet. Keep publishing answer-first updates on top trending topics."}
            </div>
            <div className="rule-card__foot">
              <div className="rule-readiness">
                aeo signal
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
                <div className="lane__title">Recommended Actions</div>
                <div className="lane__hint">top three concrete content moves for today</div>
              </div>
            </div>
            <div className="lane__count"><b>{topRecommendations.length}</b> actions</div>
          </div>
          <article className="rule-card">
            <div className="rule-card__hd">
              <div className="rule-card__hd__l">
                <span className="rule-kind">publish queue today</span>
                <span className="rule-status">{graceState?.latest_run ? "fresh model run" : "fallback model"}</span>
              </div>
              <button type="button" className="btn-quiet" onClick={() => void copyText(topRecommendations.join("\n"))}>copy</button>
            </div>
            <div className="rule-card__body">
              {topRecommendations.length > 0
                ? topRecommendations.map((line) => `- ${line}`).join("\n")
                : "No recommendation list available yet. Start with one answer-first explainer and one comparison post."}
            </div>
          </article>
        </div>

        <div className="lane">
          <div className="lane__hd">
            <div className="lane__hd__l">
              <div className="lane__num">3</div>
              <div>
                <div className="lane__title">Feedback to Improve Rank</div>
                <div className="lane__hint">what to change in content structure for better AI citation lift</div>
              </div>
            </div>
            <div className="lane__count"><b>{rankFeedback.length}</b> notes</div>
          </div>
          <div className="rule-help">
            <span>!</span>
            <span><b>Quick stats:</b> {quickStats.join(" · ")}</span>
            <button type="button" className="btn-quiet" onClick={() => void copyText([...rankFeedback, ...quickStats].join("\n"))}>
              copy all
            </button>
          </div>
          <div className="rule-cards">
            <article className="rule-card">
              <div className="rule-card__hd">
                <div className="rule-card__hd__l">
                  <span className="rule-kind">content feedback today</span>
                  <span className="rule-status">{topTopics.length} tracked topics</span>
                </div>
                <button type="button" className="btn-quiet" onClick={() => void copyText(rankFeedback.join("\n"))}>copy</button>
              </div>
              <div className="rule-card__body">
                {rankFeedback.length > 0
                  ? rankFeedback.map((line) => `- ${line}`).join("\n")
                  : "Add one-sentence direct answers near the top of each post and tighten headings to query intent."}
              </div>
              <div className="rule-card__foot">
                <div className="rule-readiness">
                  rank readiness
                  <span className="bar"><i style={{ width: `${Math.max(8, Math.min(100, aeoNorthStar))}%` }} /></span>
                </div>
              </div>
            </article>

            <article className="rule-card">
              <div className="rule-card__hd">
                <div className="rule-card__hd__l">
                  <span className="rule-kind">operator context</span>
                  <span className="rule-status">{graceStatusLabel}</span>
                </div>
                <button type="button" className="btn-quiet" onClick={() => void copyText(quickStats.join("\n"))}>copy</button>
              </div>
              <div className="rule-card__body">
                {quickStats.map((line) => `- ${line}`).join("\n")}
              </div>
              <div className="rule-card__foot">
                <div className="rule-readiness">
                  execution pressure
                  <span className="bar"><i style={{ width: `${Math.max(8, Math.min(100, recommendationBacklog * 10))}%` }} /></span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
