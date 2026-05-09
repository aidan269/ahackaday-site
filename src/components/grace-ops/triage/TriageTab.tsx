"use client";

import { useEffect, useMemo, useState } from "react";

import { buildOpsIocRows } from "@/lib/ops-iocs";

import { ScoreChip } from "../ScoreChip";
import type { GraceState, ResponseTrack, TriageIncident, TypedIoc } from "../types";
import { IocWorkbench } from "./IocWorkbench";
import { classifyIoc } from "./ioc-utils";
import { ResponseTracks } from "./ResponseTracks";

type IocTab = "all" | "network" | "vuln" | "packages";

export function TriageTab({
  incident,
  incidentKey,
  incidentUrl,
  initialGraceState = null,
  aeoScore = null,
}: {
  incident: TriageIncident;
  incidentKey: string;
  incidentUrl: string;
  initialGraceState?: GraceState | null;
  /** Citation-worthiness score from Content pipeline; shown first in Triage. */
  aeoScore?: number | null;
}) {
  const [activeTab, setActiveTab] = useState<IocTab>("all");
  const [graceState, setGraceState] = useState<GraceState | null>(initialGraceState);
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

  const graceEnabled = process.env.NEXT_PUBLIC_OPS_PACK_GRACE_ENABLED === "1";

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
    <div className="ops__lanes">
      <div className="lane lane--aeo-priority">
        <div className="lane__hd lane__hd--aeo">
          <div className="lane__hd__l">
            <div className="lane__num">1</div>
            <div>
              <div className="lane__title">AEO / GEO citation score</div>
              <div className="lane__hint">Open Content tab for rubric, edits, and topic tracks</div>
            </div>
          </div>
          <div className="lane__aeo-score-group" aria-label="Citation-worthiness score">
            <span className="detail__aeo-score-label">Score</span>
            <ScoreChip score={aeoScore} />
          </div>
        </div>
      </div>
      <IocWorkbench
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        tabRows={tabRows}
        counts={counts}
        graceState={graceState}
        typedIocs={typedIocs}
        incident={incident}
        copyText={copyText}
        download={download}
      />
      <ResponseTracks
        graceEnabled={graceEnabled}
        graceState={graceState}
        incident={incident}
        openTrack={openTrack}
      />
    </div>
  );
}
