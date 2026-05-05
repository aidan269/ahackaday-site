"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  if (source === "grace_workspace") return "Grace";
  return "Feed";
}

function signalTier(score: number): { tier: string; caption: string } {
  const n = Math.max(0, Math.min(100, Math.round(score)));
  if (n >= 70) return { tier: "Strong", caption: "Solid vs typical incident pages in Grace." };
  if (n >= 45) return { tier: "Growing", caption: "On track — tighten answer-first structure to lift further." };
  if (n >= 25) return { tier: "Building", caption: "Diagnostic score — not a final grade." };
  return { tier: "Early", caption: "Baseline — publish structured updates to move this." };
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
  return `${item.action}\nImpact: ${item.expected_impact}\nSource: ${sourceBadgeLabel(item.source)} · ${item.confidence}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Slim view model — keeps JSX shallow. */
function buildGraceOpsPanelView(input: {
  incidentCategory: string;
  incidentTitle: string;
  dailyDigest: GraceOpsDailyDigest | null;
  sourceMode: string | null;
  dataQuality: DigestDataQuality | null;
  graceState: GraceState | null;
  graceEnabled: boolean;
}) {
  const {
    incidentCategory,
    incidentTitle,
    dailyDigest,
    sourceMode,
    dataQuality,
    graceState,
    graceEnabled,
  } = input;

  const aeoNorthStar = graceState?.kpis.north_star ?? 0;
  const answerInclusion = graceState?.kpis.answer_inclusion ?? 0;
  const freshness = graceState?.kpis.freshness ?? 0;
  const tasks = graceState?.kpis.open_actions ?? 0;
  const dailyHealth = Math.round((freshness + answerInclusion) / 2);
  const pageTier = signalTier(dailyHealth);
  const inclusionTier = signalTier(answerInclusion);
  const rankTier = signalTier(aeoNorthStar);

  const digestShort =
    sourceMode === "hybrid" ? "Grace + feed"
      : sourceMode === "local_fallback" ? "Feed only"
        : sourceMode === "grace_workspace" ? "Grace"
          : "—";

  const themeLabels = (dailyDigest?.themes ?? [incidentCategory]).slice(0, 4).map(humanizeTheme);
  const signalsLine = dailyDigest?.signals_summary ?? null;
  const opportunities = (dailyDigest?.opportunity_items ?? []).slice(0, 3);
  const actions = (dailyDigest?.recommendation_items ?? []).slice(0, 3);
  const feedback = (dailyDigest?.feedback ?? []).slice(0, 4);

  const completenessLabel =
    typeof dataQuality?.completeness === "number" ? `${dataQuality.completeness}% ready` : "—";

  const snapshotLine = `Today · ${completenessLabel} · ${digestShort} · ${tasks} open tasks`;

  const opportunitiesCopy = opportunities.map(formatOpportunityCopyBlock).join("\n\n");
  const actionsCopy = actions.map(formatRecommendationCopyBlock).join("\n\n");
  const lane2Copy = [
    `Anchor: ${incidentTitle}`,
    "",
    snapshotLine,
    "",
    "— ACTIONS —",
    actions.length ? actionsCopy : "(none)",
    "",
    "— FEEDBACK —",
    feedback.length ? feedback.join("\n") : "(none)",
  ].join("\n");

  const opportunitiesBody =
    opportunities.length > 0
      ? opportunities
        .map((item, idx) =>
          `${idx + 1}. ${item.opportunity_title} · ${item.confidence}\n   ${item.why_now}\n   Angle: ${item.recommended_angle}\n   Impact: ${item.expected_impact}${
            item.evidence_refs.length ? `\n   Refs: ${item.evidence_refs.join(", ")}` : ""
          }`,
        )
        .join("\n\n")
      : "";

  const lane2Body =
    dailyDigest === null
      ? "Loading…"
      : [
        actions.length > 0
          ? actions
            .map(
              (item, idx) =>
                `${idx + 1}. ${item.action}\n   Impact: ${item.expected_impact}\n   ${sourceBadgeLabel(item.source)} · ${item.confidence}`,
            )
            .join("\n\n")
          : "No actions queued — draft a FAQ + comparison post from the themes in column 1.",
        "\n— — —\n",
        feedback.length > 0
          ? feedback.map((line) => `• ${line}`).join("\n")
          : "Lead with one blunt answer sentence, then bullets with dates.",
      ].join("\n");

  const graceStatusLabel = !graceEnabled
    ? "grace off"
    : !graceState
      ? "connecting…"
      : graceState.top_recommendation
        ? "guidance live"
        : "connected";

  const headerDigest = digestShort;
  const headerSignalsTitle = `${pageTier.caption} Freshness ${Math.round(freshness)} + answer-inclusion ${Math.round(answerInclusion)}. Open tasks: ${tasks}.`;

  return {
    themeLabels,
    signalsLine,
    opportunities,
    actions,
    feedback,
    opportunitiesCopy,
    lane2Copy,
    opportunitiesBody,
    lane2Body,
    snapshotLine,
    digestShort,
    completenessLabel,
    graceStatusLabel,
    headerDigest,
    headerSignalsTitle,
    pageTier,
    dailyHealth,
    inclusionTier,
    rankTier,
    answerInclusion,
    aeoNorthStar,
    tasks,
    loadingDigest: dailyDigest === null,
    emptyOpportunities: dailyDigest !== null && opportunities.length === 0,
  };
}

export function IncidentOpsPack({ incident, incidentKey, initialGraceState = null }: OpsPackProps) {
  const [graceState, setGraceState] = useState<GraceState | null>(initialGraceState);
  const [dailyDigest, setDailyDigest] = useState<GraceOpsDailyDigest | null>(null);
  const [sourceMode, setSourceMode] = useState<string | null>(null);
  const [dataQuality, setDataQuality] = useState<DigestDataQuality | null>(null);
  const [copyToast, setCopyToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const graceEnabled = process.env.NEXT_PUBLIC_OPS_PACK_GRACE_ENABLED === "1";

  const panel = useMemo(
    () =>
      buildGraceOpsPanelView({
        incidentCategory: incident.category,
        incidentTitle: incident.title,
        dailyDigest,
        sourceMode,
        dataQuality,
        graceState,
        graceEnabled,
      }),
    [incident.category, incident.title, dailyDigest, sourceMode, dataQuality, graceState, graceEnabled],
  );

  const showCopyResult = useCallback((ok: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setCopyToast({
      ok,
      msg: ok ? "Copied to clipboard." : "Could not copy — try selecting text or check permissions.",
    });
    toastTimer.current = setTimeout(() => setCopyToast(null), 3200);
  }, []);

  const copyText = useCallback(
    async (value: string) => {
      const ok = await copyToClipboard(value);
      showCopyResult(ok);
    },
    [showCopyResult],
  );

  async function refreshGraceState() {
    if (!graceEnabled) return;
    try {
      const response = await fetch(`/api/ops/incident-state?incident_key=${encodeURIComponent(incidentKey)}`);
      if (!response.ok) return;
      const data = await response.json() as { ok: boolean; state?: GraceState };
      if (data.ok && data.state) setGraceState(data.state);
    } catch {
      /* ok */
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
      /* ok */
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

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  return (
    <section className="ops">
      {copyToast ? (
        <div className={`ops-copy-toast${copyToast.ok ? "" : " ops-copy-toast--err"}`} role="status">
          {copyToast.msg}
        </div>
      ) : null}

      <div className="ops__hd">
        <div className="ops__hd__l">
          <div>
            <div className="ops__name">Grace Ops</div>
            <div className="ops__sub">daily feed digest · incident signals from Grace</div>
          </div>
        </div>
        <div className="ops__hd__r ops__hd__r--compact">
          <span className="ops__fresh"><span className="dot" /> {graceState?.stale ? "stale" : "fresh"}</span>
          <span className="ops__fresh">{panel.graceStatusLabel}</span>
          <span className="ops__fresh">{panel.headerDigest}</span>
          {graceEnabled && graceState ? (
            <span className="ops__fresh" title={panel.headerSignalsTitle}>
              signals {panel.pageTier.tier} · {panel.dailyHealth}/100
            </span>
          ) : null}
        </div>
      </div>

      <div className="ops__lanes">
        <div className="lane">
          <div className="lane__hd">
            <div className="lane__hd__l">
              <div className="lane__num">1</div>
              <div>
                <div className="lane__title">Opportunities</div>
                <div className="lane__hint">where to win vs Cantina · ranked by momentum</div>
              </div>
            </div>
            <div className="lane__count"><b>{panel.opportunities.length}</b></div>
          </div>
          <div className="rule-help">
            <span>!</span>
            <div className="rule-help__scroll">
              <b>Themes:</b> {panel.themeLabels.join(" · ")}
              {panel.signalsLine ? (
                <>
                  <br />
                  <b>Signals:</b> {panel.signalsLine}
                </>
              ) : null}
            </div>
            <button
              type="button"
              className="btn-quiet"
              disabled={!panel.opportunitiesCopy}
              onClick={() => void copyText(panel.opportunitiesCopy)}
            >
              copy
            </button>
          </div>
          <article className="rule-card">
            <div className="rule-card__body">
              {panel.loadingDigest
                ? "Loading…"
                : panel.emptyOpportunities
                  ? "No gap ranked yet — check ingest or try again after new posts."
                  : panel.opportunitiesBody}
            </div>
            <div className="rule-card__foot">
              <div className="rule-readiness" title={panel.inclusionTier.caption}>
                answer inclusion · {panel.inclusionTier.tier} ({Math.round(panel.answerInclusion)}/100)
                <span className="bar"><i style={{ width: `${Math.max(8, Math.min(100, panel.answerInclusion))}%` }} /></span>
              </div>
            </div>
          </article>
        </div>

        <div className="lane">
          <div className="lane__hd">
            <div className="lane__hd__l">
              <div className="lane__num">2</div>
              <div>
                <div className="lane__title">Actions & feedback</div>
                <div className="lane__hint">queue for today · plus edit notes (same scroll)</div>
              </div>
            </div>
            <div className="lane__count"><b>{panel.actions.length}</b> · <b>{panel.feedback.length}</b></div>
          </div>
          <div className="rule-help">
            <span>#</span>
            <div className="rule-help__scroll">
              <b>{panel.snapshotLine}</b>
              <br />
              <b>Anchor:</b> {incident.title}
            </div>
            <button type="button" className="btn-quiet" onClick={() => void copyText(panel.lane2Copy)}>
              copy all
            </button>
          </div>
          <article className="rule-card">
            <div className="rule-card__body">{panel.lane2Body}</div>
            <div className="rule-card__foot">
              <div
                className="rule-readiness"
                title={`${panel.rankTier.caption} Tasks: ${panel.tasks}.`}
              >
                rank · {panel.rankTier.tier} ({Math.round(panel.aeoNorthStar)}/100)
                <span className="bar"><i style={{ width: `${Math.max(8, Math.min(100, panel.aeoNorthStar))}%` }} /></span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
