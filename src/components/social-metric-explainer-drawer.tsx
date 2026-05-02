"use client";

import { useMemo, useState } from "react";

import type { Incident } from "@/lib/incident-types";
import type { SocialDataQuality } from "@/lib/incident-types";

function fmtTs(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export function SocialMetricExplainerDrawer({
  incident,
}: {
  incident: Pick<
    Incident,
    | "socialDataQuality"
    | "socialMetricsUpdatedAt"
    | "socialMentions24h"
    | "socialMetricExplainers"
    | "slug"
  >;
}) {
  const [open, setOpen] = useState(false);
  const q = incident.socialDataQuality as SocialDataQuality | undefined;

  const summary = useMemo(() => {
    const ex = incident.socialMetricExplainers;
    if (!ex) return null;
    return ex;
  }, [incident.socialMetricExplainers]);

  const chip =
    q === "live_measured"
      ? "live measured"
      : q === "live_zero"
        ? "live · zero vol"
        : "pending scan";

  return (
    <div className="social-expl">
      <button type="button" className="social-expl__chip" onClick={() => setOpen((v) => !v)}>
        {chip}
        <span className="social-expl__q">why this number?</span>
      </button>
      {open ? (
        <div className="social-expl__panel">
          <div className="social-expl__row">
            <span className="k">quality band</span>
            <span className="v">{chip}</span>
          </div>
          <div className="social-expl__row">
            <span className="k">cross-platform 24h total</span>
            <span className="v">{incident.socialMentions24h ?? "—"}</span>
          </div>
          <div className="social-expl__row">
            <span className="k">metrics row updated</span>
            <span className="v">{fmtTs(incident.socialMetricsUpdatedAt)}</span>
          </div>
          {summary ? (
            <>
              <div className="social-expl__row">
                <span className="k">scan window</span>
                <span className="v">{summary.window_hours}h rolling</span>
              </div>
              <div className="social-expl__row">
                <span className="k">scan latency</span>
                <span className="v">
                  {typeof summary.scan_latency_ms === "number" ? `${summary.scan_latency_ms} ms` : "—"}
                </span>
              </div>
              <div className="social-expl__row">
                <span className="k">platform raw counts</span>
                <span className="v">
                  github {summary.platforms?.github?.raw_count ?? "—"} · reddit{" "}
                  {summary.platforms?.reddit?.raw_count ?? "—"} · x {summary.platforms?.x?.raw_count ?? "—"}
                </span>
              </div>
              <div className="social-expl__row">
                <span className="k">split source</span>
                <span className="v">{summary.split_source ?? "—"}</span>
              </div>
            </>
          ) : (
            <p className="social-expl__muted">
              Structured explainers populate after the next unified refresh writes `social_metric_explainers`.
            </p>
          )}
          <p className="social-expl__muted">
            AHackaday prefers measured totals from GitHub + Reddit + X APIs. When totals are zero, platform splits may be
            synthetic placeholders — never treated as measured signal.
          </p>
        </div>
      ) : null}
    </div>
  );
}
