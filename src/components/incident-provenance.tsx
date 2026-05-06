import type { IncidentClaimRecord, IncidentRevisionRecord } from "@/lib/incident-types";

function safeLocalDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Unknown";
  try {
    return parsed.toLocaleString();
  } catch {
    return "Unknown";
  }
}

function ConfidenceChip({ value }: { value: number | null }) {
  if (value === null || Number.isNaN(value)) return <span className="claim-conf">n/a</span>;
  const pct = Math.round(value * 100);
  return <span className="claim-conf">{pct}% conf</span>;
}

export function IncidentProvenancePanel({
  claims,
  revisions,
  sources,
  severityInference,
}: {
  claims: IncidentClaimRecord[];
  revisions: IncidentRevisionRecord[];
  sources: string[];
  severityInference: string[];
}) {
  const derivedSeverityClaims =
    severityInference.length > 0
      ? severityInference.map((text, idx) => ({
          id: `severity-auto-${idx}`,
          field: "severity.uplift",
          value: text,
          sourceUrl: null as string | null,
          snippet: null as string | null,
          confidence: null as number | null,
          inferredBy: "heuristic" as const,
          createdAt: "",
        }))
      : [];

  const allClaims = [...claims, ...derivedSeverityClaims];

  return (
    <div className="prov-grid">
      <section className="prov-card">
        <h3 className="prov-card__title">Provenance</h3>
        <p className="prov-card__sub">Claims tie surfaced fields back to sources, models, or heuristics.</p>
        {allClaims.length === 0 ? (
          <p className="prov-empty">No structured claims yet — severity uplift rationale still applies below.</p>
        ) : (
          <ul className="claim-list">
            {allClaims.map((c) => (
              <li key={c.id} className="claim-row">
                <div className="claim-row__hd">
                  <span className="claim-field">{c.field}</span>
                  <span className={`claim-src claim-src--${c.inferredBy}`}>{c.inferredBy}</span>
                  <ConfidenceChip value={c.confidence} />
                </div>
                <div className="claim-val">{c.value}</div>
                {c.sourceUrl ? (
                  <a className="claim-link" href={c.sourceUrl} target="_blank" rel="noreferrer">
                    {c.sourceUrl}
                  </a>
                ) : null}
                {c.snippet ? <blockquote className="claim-snippet">{c.snippet}</blockquote> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="prov-card">
        <h3 className="prov-card__title">What changed</h3>
        <p className="prov-card__sub">Append-only revisions when ingest or analysts evolve the record.</p>
        {revisions.length === 0 ? (
          <p className="prov-empty">No revision rows stored yet.</p>
        ) : (
          <ul className="rev-list">
            {revisions.map((r) => (
              <li key={r.id} className="rev-row">
                <div className="rev-meta">
                  <span>r{r.revisionNo}</span>
                  <span>{r.source}</span>
                  <span>{safeLocalDateTime(r.createdAt)}</span>
                </div>
                <div className="rev-fields">{r.changedFields.join(", ") || "snapshot"}</div>
                {r.note ? <div className="rev-note">{r.note}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="prov-card">
        <h3 className="prov-card__title">Sources</h3>
        <ul className="src-list">
          {sources.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
