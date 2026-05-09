"use client";

import type { GraceState, IocType, TypedIoc, TriageIncident } from "../types";
import { classifyIoc, iconTypeClass, toTxt } from "./ioc-utils";

type Tab = "all" | "network" | "vuln" | "packages";

export function IocWorkbench({
  activeTab,
  setActiveTab,
  tabRows,
  counts,
  graceState,
  typedIocs,
  incident,
  copyText,
  download,
}: {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  tabRows: TypedIoc[];
  counts: { all: number; network: number; vuln: number; packages: number };
  graceState: GraceState | null;
  typedIocs: TypedIoc[];
  incident: TriageIncident;
  copyText: (value: string) => Promise<void>;
  download: (filename: string, mime: string, content: string) => void;
}) {
  return (
    <div className="lane">
      <div className="lane__hd">
        <div className="lane__hd__l">
          <div className="lane__num">2</div>
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
              ? graceState.extracted_indicators.slice(0, 20).map((value) => ({
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
  );
}
