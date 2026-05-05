"use client";

import { useEffect, useMemo, useState } from "react";

import { buildOpsIocRows } from "@/lib/ops-iocs";

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

type IocType = "cve" | "ip" | "domain" | "url" | "hash" | "package" | "other";

type TypedIoc = {
  type: IocType;
  value: string;
  confidence: "high" | "mid" | "low";
  score: number;
};

type ResponseTrack = "contain" | "hunt" | "patch" | "brief";

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
  ioc_count: number;
  extracted_indicators: string[];
};

type WeeklyAeoBrief = {
  generated_at: string;
  week_of: string;
  topics: string[];
  recommendations: string[];
  feedback: string[];
};

function classifyIoc(value: string): IocType {
  const v = value.trim();
  if (!v) return "other";
  if (/^CVE-\d{4}-\d+$/i.test(v)) return "cve";
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v)) return "ip";
  if (/^https?:\/\/\S+/i.test(v)) return "url";
  if (/^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(v)) return "hash";
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) return "domain";
  if (/[a-z0-9_-]+\/[a-z0-9._-]+/i.test(v) || /^[a-z0-9._-]+$/i.test(v)) return "package";
  return "other";
}

function toTxt(rows: TypedIoc[]) {
  return rows.map((r) => `[${r.type}] ${r.value}`).join("\n");
}

export function IncidentOpsPack({ incident, incidentKey, incidentUrl, initialGraceState = null }: OpsPackProps) {
  const [activeTab, setActiveTab] = useState<"all" | "network" | "vuln" | "packages">("all");
  const [graceState, setGraceState] = useState<GraceState | null>(initialGraceState);
  const [weeklyBrief, setWeeklyBrief] = useState<WeeklyAeoBrief | null>(null);
  const [runStatus, setRunStatus] = useState<"idle" | "queued" | "started" | "completed" | "failed">("idle");
  const typedIocs = useMemo(() => {
    return buildOpsIocRows(incident).map((row) => ({
      value: row.value,
      type: classifyIoc(row.value),
      confidence: row.confidence,
      score: row.score,
    }));
  }, [incident]);

  const tabRows = useMemo(() => {
    if (activeTab === "all") return typedIocs;
    if (activeTab === "network") {
      return typedIocs.filter((r) => r.type === "ip" || r.type === "domain" || r.type === "url");
    }
    if (activeTab === "vuln") return typedIocs.filter((r) => r.type === "cve" || r.type === "hash");
    return typedIocs.filter((r) => r.type === "package");
  }, [activeTab, typedIocs]);

  const counts = useMemo(() => {
    const network = typedIocs.filter((r) => r.type === "ip" || r.type === "domain" || r.type === "url").length;
    const vuln = typedIocs.filter((r) => r.type === "cve" || r.type === "hash").length;
    const packages = typedIocs.filter((r) => r.type === "package").length;
    return { all: typedIocs.length, network, vuln, packages };
  }, [typedIocs]);

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API can fail in restricted contexts
    }
  }

  function download(filename: string, mime: string, content: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function iconTypeClass(type: IocType): "h" | "d" | "i" {
    if (type === "hash" || type === "cve") return "h";
    if (type === "domain" || type === "url") return "d";
    return "i";
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
  const agentAnalyticsSignal = graceState?.latest_run ? "tracking" : "idle";
  const recommendationBacklog = graceState?.kpis.open_actions ?? 0;
  const weeklyFocus = (weeklyBrief?.topics ?? [incident.category, incident.severity]).slice(0, 3);
  const strategyRecommendations = (weeklyBrief?.recommendations ?? []).slice(0, 3);
  const topActions = strategyRecommendations.map((rec, index) => {
    const owner = index === 0 ? "content" : index === 1 ? "editorial" : "ops";
    const eta = index === 0 ? "48h" : index === 1 ? "72h" : "this week";
    return `${rec} · owner: ${owner} · eta: ${eta}`;
  });
  const proofPoints = [
    `Topic coverage this cycle: ${weeklyBrief?.topics.length ?? weeklyFocus.length} prioritized themes.`,
    `Answer inclusion signal: ${answerInclusion}% with AEO score ${aeoNorthStar}.`,
    `Execution backlog: ${recommendationBacklog} open recommendations.`,
  ];

  function fallbackTrackPrompt(track: ResponseTrack): string {
    const iocPreview = typedIocs.slice(0, 8).map((row) => row.value).join(", ") || "none";
    return [
      `Grace track: ${track.toUpperCase()}`,
      `Incident: ${incident.title}`,
      `Severity: ${incident.severity}`,
      `IOC count: ${typedIocs.length}`,
      `Top IOCs: ${iocPreview}`,
      "Use available plugins to produce an actionable runbook in 8 bullets max.",
    ].join("\n");
  }

  async function refreshGraceState() {
    if (!graceEnabled) return;
    try {
      const response = await fetch(`/api/ops/incident-state?incident_key=${encodeURIComponent(incidentKey)}`);
      if (!response.ok) return;
      const data = await response.json() as { ok: boolean; state?: GraceState };
      if (data.ok && data.state) {
        setGraceState(data.state);
        if (data.state.latest_run?.status) {
          setRunStatus(data.state.latest_run.status);
        }
      }
    } catch {
      // Grace fetch is best-effort for UI continuity.
    }
  }

  async function refreshWeeklyBrief() {
    if (!graceEnabled) return;
    try {
      const response = await fetch("/api/ops/weekly-aeo");
      if (!response.ok) return;
      const data = await response.json() as { ok: boolean; brief?: WeeklyAeoBrief };
      if (data.ok && data.brief) {
        setWeeklyBrief(data.brief);
      }
    } catch {
      // best-effort only
    }
  }

  useEffect(() => {
    if (!graceEnabled) return;
    const timer = setTimeout(() => {
      void refreshGraceState();
      void refreshWeeklyBrief();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentKey, graceEnabled]);

  useEffect(() => {
    if (!graceEnabled) return;
    if (runStatus === "queued" || runStatus === "started") {
      const id = setInterval(() => {
        void refreshGraceState();
      }, 3000);
      return () => clearInterval(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runStatus, graceEnabled]);

  async function openTrack(track: ResponseTrack) {
    if (graceEnabled) {
      try {
        setRunStatus("queued");
        await fetch("/api/ops/run-incident", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incident_key: incidentKey,
            incident_url: incidentUrl,
            incident_title: incident.title,
            severity: incident.severity,
            related_urls: incident.sources.slice(0, 8),
            tags: [incident.category, track],
          }),
        });
        await refreshGraceState();
        return;
      } catch {
        setRunStatus("failed");
      }
    }

    await copyText(fallbackTrackPrompt(track));
  }

  return (
    <section className="ops">
      <div className="ops__hd">
        <div className="ops__hd__l">
          <div>
            <div className="ops__name">Grace Ops</div>
            <div className="ops__sub">grace intelligence for incident response</div>
          </div>
        </div>
        <div className="ops__hd__r">
          <span className="ops__fresh"><span className="dot" /> {graceState?.stale ? "stale" : "fresh"}</span>
          <span className="ops__fresh">{graceStatusLabel}</span>
          {graceEnabled && graceState ? (
            <>
              <span className="ops__fresh">
                weekly health {Math.round((graceState.kpis.freshness + graceState.kpis.answer_inclusion) / 2)}
              </span>
              <span className="ops__fresh">
                trend {graceState.kpis.open_actions > 6 ? "backlog heavy" : "on track"}
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
                <div className="lane__title">IOC Workbench</div>
                <div className="lane__hint">typed indicators with fast copy and export actions</div>
              </div>
            </div>
            <div className="lane__count"><b>{graceState?.ioc_count ?? typedIocs.length}</b> total</div>
          </div>
          <div className="ioc-tabs">
            <button type="button" className={`ioc-tab${activeTab === "all" ? " active" : ""}`} onClick={() => setActiveTab("all")}>
              all <span className="tag">{counts.all}</span>
            </button>
            <button type="button" className={`ioc-tab${activeTab === "network" ? " active" : ""}`} onClick={() => setActiveTab("network")}>
              network <span className="tag">{counts.network}</span>
            </button>
            <button type="button" className={`ioc-tab${activeTab === "vuln" ? " active" : ""}`} onClick={() => setActiveTab("vuln")}>
              vuln <span className="tag">{counts.vuln}</span>
            </button>
            <button type="button" className={`ioc-tab${activeTab === "packages" ? " active" : ""}`} onClick={() => setActiveTab("packages")}>
              packages <span className="tag">{counts.packages}</span>
            </button>
          </div>

          {tabRows.length === 0 ? (
            <div className="ioc-empty">
              <div className="ioc-empty__icon">!</div>
              <div className="ioc-empty__txt">
                <b>No indicators in this slice yet.</b>
                <span>Switch tabs or export the full IOC set.</span>
              </div>
            </div>
          ) : (
            <>
              <div className="ioc-list">
                {(graceState?.extracted_indicators?.length
                  ? graceState.extracted_indicators
                    .filter((value) => !/^inc_[a-f0-9]{10,}$/i.test(value))
                    .slice(0, 20)
                    .map((value) => ({
                    value,
                    type: classifyIoc(value),
                    confidence: "mid" as const,
                    score: 72,
                  }))
                  : tabRows.slice(0, 20)
                ).map((row) => (
                  <div key={`${row.type}-${row.value}`} className="ioc-row">
                    <span className={`ioc-row__type ${iconTypeClass(row.type)}`}>{row.type[0]}</span>
                    <span className="ioc-row__val">{row.value}</span>
                    <span className="ioc-row__conf">
                      <span className={`conf-bar ${row.confidence}`}>
                        <i /><i /><i />
                      </span>
                    </span>
                    <span className="ioc-row__act">
                      <button type="button" className="ioc-act" onClick={() => void copyText(row.value)}>copy</button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="ioc-bulk">
                <div className="ioc-bulk__txt"><b>{graceState?.ioc_count ?? typedIocs.length}</b> indicators staged for handoff.</div>
                <button type="button" className="btn-quiet" onClick={() => void copyText(toTxt(typedIocs))}>copy all</button>
                <button type="button" className="btn-quiet" onClick={() => download(`${incident.slug}-iocs.txt`, "text/plain", toTxt(typedIocs))}>
                  txt
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    download(
                      `${incident.slug}-iocs.json`,
                      "application/json",
                      JSON.stringify(typedIocs, null, 2),
                    )
                  }
                >
                  json
                </button>
              </div>
            </>
          )}
        </div>

        <div className="lane">
          <div className="lane__hd">
            <div className="lane__hd__l">
              <div className="lane__num">2</div>
              <div>
                <div className="lane__title">AEO/GEO Strategy Agent</div>
                <div className="lane__hint">what to publish this week to improve AI search rank across the full feed</div>
              </div>
            </div>
            <div className="lane__count"><b>2</b> formats</div>
          </div>

          <div className="rule-help">
            <span>!</span>
            <span>
              <b>Weekly plan:</b> focus + actions + proof signals for ranking gains.
            </span>
            <button
              type="button"
              className="btn-quiet"
              onClick={() => void copyText([...weeklyFocus, ...topActions, ...proofPoints].join("\n"))}
            >
              copy all
            </button>
          </div>

          <div className="rule-cards">
            <article className="rule-card">
              <div className="rule-card__hd">
                <div className="rule-card__hd__l">
                  <span className="rule-kind">this week's focus</span>
                  <span className="rule-status">{weeklyFocus.length} topics</span>
                </div>
                <button type="button" className="btn-quiet" onClick={() => void copyText(weeklyFocus.join("\n"))}>copy</button>
              </div>
              <div className="rule-card__body">
                {weeklyFocus.length > 0
                  ? weeklyFocus.map((cluster, index) => `${index + 1}. ${cluster}`).join("\n")
                  : "No weekly focus topics available yet."}
              </div>
              <div className="rule-card__foot">
                <div className="rule-readiness">
                  focus confidence
                  <span className="bar"><i style={{ width: `${Math.max(8, Math.min(100, answerInclusion))}%` }} /></span>
                </div>
              </div>
            </article>

            <article className="rule-card">
              <div className="rule-card__hd">
                <div className="rule-card__hd__l">
                  <span className="rule-kind">top 3 actions + why</span>
                  <span className="rule-status">{agentAnalyticsSignal} </span>
                </div>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => void copyText([...topActions, ...proofPoints].join("\n"))}
                >
                  copy
                </button>
              </div>
              <div className="rule-card__body">
                {[...topActions, ...proofPoints]
                  .map((line) => `- ${line}`)
                  .join("\n") || "No action plan generated yet for this weekly cycle."}
              </div>
              <div className="rule-card__foot">
                <div className="rule-readiness">
                  aeo score
                  <span className="bar"><i style={{ width: `${Math.max(8, Math.min(100, aeoNorthStar))}%` }} /></span>
                </div>
              </div>
            </article>
          </div>
        </div>

        <div className="lane">
          <div className="lane__hd">
            <div className="lane__hd__l">
              <div className="lane__num">3</div>
              <div>
                <div className="lane__title">Response Tracks</div>
                <div className="lane__hint">fast operational tracks from this incident snapshot</div>
              </div>
            </div>
            <div className="lane__count">
              <b>4</b> tracks
              {graceEnabled && graceState?.top_recommendation ? (
                <span className="tag" style={{ marginLeft: 8 }}>
                  {graceState.top_recommendation.status}
                </span>
              ) : null}
            </div>
          </div>
          {graceEnabled && graceState?.top_recommendation ? (
            <div className="rule-help">
              <span>!</span>
              <span>
                <b>Top Grace action:</b> {graceState.top_recommendation.title}
              </span>
              <span className="tag">{graceState.top_recommendation.status}</span>
            </div>
          ) : null}
          <div className="resp-grid">
            <button type="button" className="resp-card danger" onClick={() => void openTrack("contain")}>
              <span className="resp-card__icon">!</span>
              <div className="resp-card__title">Contain</div>
              <div className="resp-card__desc">Block indicators and isolate impacted assets.</div>
              <div className="resp-card__target"><span>target</span><b>soc</b></div>
            </button>
            <button type="button" className="resp-card calm" onClick={() => void openTrack("hunt")}>
              <span className="resp-card__icon">i</span>
              <div className="resp-card__title">Hunt</div>
              <div className="resp-card__desc">Sweep recent telemetry for indicator hits.</div>
              <div className="resp-card__target"><span>target</span><b>detection</b></div>
            </button>
            <button type="button" className="resp-card go" onClick={() => void openTrack("patch")}>
              <span className="resp-card__icon">{">"}</span>
              <div className="resp-card__title">Patch</div>
              <div className="resp-card__desc">Prioritize remediation from CVE evidence.</div>
              <div className="resp-card__target"><span>target</span><b>it ops</b></div>
            </button>
            <button type="button" className="resp-card" onClick={() => void openTrack("brief")}>
              <span className="resp-card__icon">#</span>
              <div className="resp-card__title">Brief</div>
              <div className="resp-card__desc">Export concise incident notes for leadership.</div>
              <div className="resp-card__target"><span>target</span><b>exec</b></div>
            </button>
          </div>
          <div className="resp-foot">source-backed <b>{incident.sources.length}</b> refs</div>
        </div>
      </div>
    </section>
  );
}
