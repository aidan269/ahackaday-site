"use client";

import type { GraceState, ResponseTrack, TriageIncident } from "../types";

export function ResponseTracks({
  graceEnabled,
  graceState,
  incident,
  openTrack,
}: {
  graceEnabled: boolean;
  graceState: GraceState | null;
  incident: TriageIncident;
  openTrack: (track: ResponseTrack) => Promise<void>;
}) {
  return (
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
  );
}
