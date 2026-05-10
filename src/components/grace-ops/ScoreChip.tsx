"use client";

const DEFAULT_AEO_TOOLTIP =
  "AEO: Answer Engine Optimization score (0–100). Measures how cite-worthy this write-up is for AI assistants (structure, sources, clarity). Open Grace Ops → Content for details.";

export function ScoreChip({
  score,
  incidentHref,
  title = DEFAULT_AEO_TOOLTIP,
}: {
  score: number | null;
  /** Feed cards: navigate to incident page Grace Ops dock (full URL path, no origin). */
  incidentHref?: string;
  /** Hover copy explaining what AEO measures (incident header pill). */
  title?: string;
}) {
  if (score == null) {
    return (
      <span className="score-chip score-chip--na" title={title}>
        —
      </span>
    );
  }
  const tier = score >= 75 ? "hi" : score >= 50 ? "mid" : "lo";
  const href = incidentHref ? `${incidentHref}#grace-ops-dock` : "#grace-ops-dock";
  return (
    <a
      href={href}
      className={`score-chip score-chip--${tier}`}
      title={title}
      onClick={(e) => {
        try {
          localStorage.setItem("graceops:active", "content");
        } catch {
          // ignore
        }
        if (incidentHref) return;
        const el = document.getElementById("grace-ops-dock");
        if (el) {
          e.preventDefault();
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          window.dispatchEvent(new CustomEvent<string>("graceops:tab", { detail: "content" }));
        }
      }}
    >
      {score}
    </a>
  );
}
