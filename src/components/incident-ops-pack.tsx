"use client";

import { useMemo, useState } from "react";

import { buildOpsIocValues } from "@/lib/ops-iocs";

type OpsPackProps = {
  incident: {
    slug: string;
    title: string;
    severity: string;
    summary: string;
    iocs: string[];
    sources: string[];
    evidence: {
      cves: string[];
      packages: string[];
    };
  };
};

type IocType = "cve" | "ip" | "domain" | "url" | "hash" | "package" | "other";

type TypedIoc = {
  type: IocType;
  value: string;
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

export function IncidentOpsPack({ incident }: OpsPackProps) {
  const [activeTab, setActiveTab] = useState<"all" | "network" | "vuln" | "packages">("all");
  const typedIocs = useMemo(() => {
    const raw = buildOpsIocValues(incident);
    return raw.map((value) => ({ value, type: classifyIoc(value) }));
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

  const sigmaRule = useMemo(() => {
    const indicators = typedIocs.slice(0, 30).map((r) => `      - "${r.value.replace(/"/g, '\\"')}"`).join("\n");
    return [
      "title: AHackaday IOC starter detection",
      `id: ahackaday-${incident.slug}`,
      `description: IOC starter rule for ${incident.title}`,
      "status: experimental",
      "author: ahackaday",
      "logsource:",
      "  product: network",
      "detection:",
      "  selection_iocs:",
      indicators || '      - "placeholder-ioc"',
      "  condition: selection_iocs",
      "falsepositives:",
      "  - unknown",
      `level: ${incident.severity === "critical" ? "high" : "medium"}`,
    ].join("\n");
  }, [incident.severity, incident.slug, incident.title, typedIocs]);

  const yaraRule = useMemo(() => {
    const strings = typedIocs
      .slice(0, 20)
      .map((r, i) => `    $ioc${i + 1} = "${r.value.replace(/"/g, '\\"')}" nocase`)
      .join("\n");
    return [
      `rule ahackaday_${incident.slug.replace(/[^a-z0-9_]/gi, "_")}`,
      "{",
      "  meta:",
      `    description = "IOC starter for ${incident.title.replace(/"/g, "'")}"`,
      '    author = "ahackaday"',
      "  strings:",
      strings || '    $ioc1 = "placeholder-ioc" nocase',
      "  condition:",
      "    any of them",
      "}",
    ].join("\n");
  }, [incident.slug, incident.title, typedIocs]);

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

  function confidenceClass(type: IocType): "high" | "mid" | "low" {
    if (type === "cve" || type === "hash" || type === "ip" || type === "url") return "high";
    if (type === "domain" || type === "package") return "mid";
    return "low";
  }

  function iconTypeClass(type: IocType): "h" | "d" | "i" {
    if (type === "hash" || type === "cve") return "h";
    if (type === "domain" || type === "url") return "d";
    return "i";
  }

  return (
    <section className="ops">
      <div className="ops__hd">
        <div className="ops__hd__l">
          <div>
            <div className="ops__name">Ops Pack</div>
            <div className="ops__sub">triage-ready iocs + detections</div>
          </div>
        </div>
        <div className="ops__hd__r">
          <span className="ops__fresh"><span className="dot" /> fresh</span>
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
            <div className="lane__count"><b>{typedIocs.length}</b> total</div>
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
                {tabRows.slice(0, 20).map((row) => (
                  <div key={`${row.type}-${row.value}`} className="ioc-row">
                    <span className={`ioc-row__type ${iconTypeClass(row.type)}`}>{row.type[0]}</span>
                    <span className="ioc-row__val">{row.value}</span>
                    <span className="ioc-row__conf">
                      <span className={`conf-bar ${confidenceClass(row.type)}`}>
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
                <div className="ioc-bulk__txt"><b>{typedIocs.length}</b> indicators staged for handoff.</div>
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
                <div className="lane__title">Rule Studio</div>
                <div className="lane__hint">starter detections generated from this IOC set</div>
              </div>
            </div>
            <div className="lane__count"><b>2</b> formats</div>
          </div>

          <div className="rule-help">
            <span>!</span>
            <span><b>Draft output:</b> validate and tune before production rollout.</span>
            <button type="button" className="btn-quiet" onClick={() => void copyText(`${sigmaRule}\n\n${yaraRule}`)}>copy all</button>
          </div>

          <div className="rule-cards">
            <article className="rule-card">
              <div className="rule-card__hd">
                <div className="rule-card__hd__l">
                  <span className="rule-kind">sigma</span>
                  <span className="rule-status">draft</span>
                </div>
                <button type="button" className="btn-quiet" onClick={() => void copyText(sigmaRule)}>copy</button>
              </div>
              <div className="rule-card__body">{sigmaRule}</div>
              <div className="rule-card__foot">
                <div className="rule-readiness">
                  coverage
                  <span className="bar"><i style={{ width: "42%" }} /></span>
                </div>
              </div>
            </article>

            <article className="rule-card">
              <div className="rule-card__hd">
                <div className="rule-card__hd__l">
                  <span className="rule-kind">yara</span>
                  <span className="rule-status">draft</span>
                </div>
                <button type="button" className="btn-quiet" onClick={() => void copyText(yaraRule)}>copy</button>
              </div>
              <div className="rule-card__body">{yaraRule}</div>
              <div className="rule-card__foot">
                <div className="rule-readiness">
                  coverage
                  <span className="bar"><i style={{ width: "38%" }} /></span>
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
            <div className="lane__count"><b>4</b> tracks</div>
          </div>
          <div className="resp-grid">
            <button type="button" className="resp-card danger">
              <span className="resp-card__icon">!</span>
              <div className="resp-card__title">Contain</div>
              <div className="resp-card__desc">Block indicators and isolate impacted assets.</div>
              <div className="resp-card__target"><span>target</span><b>soc</b></div>
            </button>
            <button type="button" className="resp-card calm">
              <span className="resp-card__icon">i</span>
              <div className="resp-card__title">Hunt</div>
              <div className="resp-card__desc">Sweep recent telemetry for indicator hits.</div>
              <div className="resp-card__target"><span>target</span><b>detection</b></div>
            </button>
            <button type="button" className="resp-card go">
              <span className="resp-card__icon">{">"}</span>
              <div className="resp-card__title">Patch</div>
              <div className="resp-card__desc">Prioritize remediation from CVE evidence.</div>
              <div className="resp-card__target"><span>target</span><b>it ops</b></div>
            </button>
            <button type="button" className="resp-card">
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
