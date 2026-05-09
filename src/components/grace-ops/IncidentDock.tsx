"use client";

import { useEffect, useState } from "react";

import { ContentTab } from "./content/ContentTab";
import { DockHeader } from "./DockHeader";
import { TriageTab } from "./triage/TriageTab";
import type { ContentData, TriageIncident } from "./types";
import type { GraceState } from "./types";

type TabId = "content" | "triage";

function freshnessFromTimestamp(ts?: string | null): { state: "fresh" | "stale" | "pending"; label: string } {
  if (!ts) return { state: "pending", label: "PENDING" };
  const ageHours = (Date.now() - new Date(ts).getTime()) / 36e5;
  return ageHours < 36 ? { state: "fresh", label: "FRESH" } : { state: "stale", label: "STALE" };
}

function formatTs(ts?: string | null) {
  if (!ts) return "—";
  return `${new Date(ts).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export function IncidentDock({
  incident,
  incidentKey,
  incidentUrl,
  initialGraceState = null,
  contentData,
  triageStale,
}: {
  incident: TriageIncident;
  incidentKey: string;
  incidentUrl: string;
  initialGraceState?: GraceState | null;
  contentData: ContentData | null;
  /** Server-known Grace stale flag for triage freshness chip. */
  triageStale?: boolean;
}) {
  const [active, setActive] = useState<TabId>("content");

  useEffect(() => {
    const saved = localStorage.getItem("graceops:active") as TabId | null;
    if (saved === "content" || saved === "triage") setActive(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("graceops:active", active);
  }, [active]);

  useEffect(() => {
    const onTab = (ev: Event) => {
      const ce = ev as CustomEvent<string>;
      if (ce.detail === "content") setActive("content");
    };
    window.addEventListener("graceops:tab", onTab as EventListener);
    return () => window.removeEventListener("graceops:tab", onTab as EventListener);
  }, []);

  const freshness =
    active === "content"
      ? freshnessFromTimestamp(contentData?.scored_at)
      : triageStale
        ? { state: "stale" as const, label: "STALE" }
        : { state: "fresh" as const, label: "FRESH" };

  const subtitle =
    active === "content"
      ? "CONTENT OPTIMIZATION · AEO/GEO"
      : "AEO / GEO SCORE · IOC WORKBENCH · RESPONSE";

  const triageIncident: TriageIncident = incident;

  return (
    <section className="ops" id="grace-ops-dock">
      <DockHeader active={active} onChange={setActive} subtitle={subtitle} freshness={freshness} />
      <div className="ops__dock-body">
        {active === "content" ? (
          <ContentTab incidentId={incident.slug} data={contentData} />
        ) : (
          <TriageTab
            incident={triageIncident}
            incidentKey={incidentKey}
            incidentUrl={incidentUrl}
            initialGraceState={initialGraceState}
            aeoScore={contentData?.total_score ?? null}
          />
        )}
      </div>
      <footer className="ops__dock-footer">
        <span>SOURCE-BACKED · {incident.sources.length} REF{incident.sources.length === 1 ? "" : "S"}</span>
        <span>
          {active === "content" && contentData
            ? `Scored ${formatTs(contentData.scored_at)} · ${contentData.model}`
            : `Updated ${formatTs(initialGraceState?.latest_run?.created_at ?? null)}`}
        </span>
      </footer>
    </section>
  );
}
