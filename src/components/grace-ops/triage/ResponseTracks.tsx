"use client";

import type { GraceState, ResponseTrack, TriageIncident } from "../types";

export function ResponseTracks({
  graceEnabled,
  graceState,
  incident,
}: {
  graceEnabled: boolean;
  graceState: GraceState | null;
  incident: TriageIncident;
  /** Reserved while response tracks are visually disabled. */
  openTrack: (track: ResponseTrack) => Promise<void>;
}) {
  return (
    <div className="lane">
      <div className="lane__hd">
        <div className="lane__hd__l">
          <div className="lane__num">3</div>
          <div>
            <div className="lane__title">Response Tracks</div>
            <div className="lane__hint">operational tracks (preview — offline)</div>
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
      <div className="lane__muted-stack">
        <div className="lane__muted-inner" aria-hidden>
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
            <button type="button" className="resp-card danger" tabIndex={-1}>
              <span className="resp-card__icon">!</span>
              <div className="resp-card__title">Contain</div>
              <div className="resp-card__desc">Block indicators and isolate impacted assets.</div>
              <div className="resp-card__target"><span>target</span><b>soc</b></div>
            </button>
            <button type="button" className="resp-card calm" tabIndex={-1}>
              <span className="resp-card__icon">i</span>
              <div className="resp-card__title">Hunt</div>
              <div className="resp-card__desc">Sweep recent telemetry for indicator hits.</div>
              <div className="resp-card__target"><span>target</span><b>detection</b></div>
            </button>
            <button type="button" className="resp-card go" tabIndex={-1}>
              <span className="resp-card__icon">{">"}</span>
              <div className="resp-card__title">Patch</div>
              <div className="resp-card__desc">Prioritize remediation from CVE evidence.</div>
              <div className="resp-card__target"><span>target</span><b>it ops</b></div>
            </button>
            <button type="button" className="resp-card" tabIndex={-1}>
              <span className="resp-card__icon">#</span>
              <div className="resp-card__title">Brief</div>
              <div className="resp-card__desc">Export concise incident notes for leadership.</div>
              <div className="resp-card__target"><span>target</span><b>exec</b></div>
            </button>
          </div>
          <div className="resp-foot">source-backed <b>{incident.sources.length}</b> refs</div>
        </div>
        <div className="lane__muted-overlay" role="presentation">
          <span className="lane__muted-badge">Tracks unavailable</span>
        </div>
      </div>
    </div>
  );
}
