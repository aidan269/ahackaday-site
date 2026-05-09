"use client";

export function ScoreChip({
  score,
  incidentHref,
}: {
  score: number | null;
  /** Feed cards: navigate to incident page Grace Ops dock (full URL path, no origin). */
  incidentHref?: string;
}) {
  if (score == null) {
    return <span className="score-chip score-chip--na">—</span>;
  }
  const tier = score >= 75 ? "hi" : score >= 50 ? "mid" : "lo";
  const href = incidentHref ? `${incidentHref}#grace-ops-dock` : "#grace-ops-dock";
  return (
    <a
      href={href}
      className={`score-chip score-chip--${tier}`}
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
