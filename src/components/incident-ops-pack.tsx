"use client";

import { useMemo } from "react";

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
  const typedIocs = useMemo(() => {
    const raw = buildOpsIocValues(incident);
    return raw.map((value) => ({ value, type: classifyIoc(value) }));
  }, [incident]);

  const grouped = useMemo(() => {
    const map = new Map<IocType, string[]>();
    for (const row of typedIocs) {
      const arr = map.get(row.type) ?? [];
      arr.push(row.value);
      map.set(row.type, arr);
    }
    return map;
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

  return (
    <section className="detail__ops">
      <div className="detail__ops-head">
        <h3>ops pack</h3>
        <span>{typedIocs.length} iocs</span>
      </div>

      <details className="detail__ops-panel">
        <summary>IOCs</summary>
        {typedIocs.length === 0 ? (
          <p className="detail__ops-empty">No structured IOCs found for this incident yet.</p>
        ) : (
          <>
            <div className="detail__ops-actions">
              <button type="button" onClick={() => void copyText(toTxt(typedIocs))}>copy all</button>
              <button
                type="button"
                onClick={() => download(`${incident.slug}-iocs.txt`, "text/plain", toTxt(typedIocs))}
              >
                download txt
              </button>
              <button
                type="button"
                onClick={() =>
                  download(
                    `${incident.slug}-iocs.json`,
                    "application/json",
                    JSON.stringify(typedIocs, null, 2),
                  )
                }
              >
                download json
              </button>
            </div>
            <div className="detail__ops-groups">
              {Array.from(grouped.entries()).map(([type, values]) => (
                <div key={type} className="detail__ops-group">
                  <div className="detail__ops-group-head">
                    <strong>{type}</strong>
                    <button
                      type="button"
                      onClick={() => void copyText(values.join("\n"))}
                    >
                      copy
                    </button>
                  </div>
                  <ul>
                    {values.map((v) => <li key={`${type}-${v}`}>{v}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </details>

      <details className="detail__ops-panel">
        <summary>Rules</summary>
        <p className="detail__ops-hint">Starter detections only. Validate and tune before production use.</p>
        <div className="detail__ops-rule">
          <div className="detail__ops-group-head">
            <strong>Sigma</strong>
            <button type="button" onClick={() => void copyText(sigmaRule)}>copy</button>
          </div>
          <pre>{sigmaRule}</pre>
        </div>
        <div className="detail__ops-rule">
          <div className="detail__ops-group-head">
            <strong>YARA</strong>
            <button type="button" onClick={() => void copyText(yaraRule)}>copy</button>
          </div>
          <pre>{yaraRule}</pre>
        </div>
      </details>
    </section>
  );
}
