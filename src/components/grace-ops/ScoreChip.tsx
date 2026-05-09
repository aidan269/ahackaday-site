"use client";

export function ScoreChip({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="score-chip score-chip--na">—</span>;
  }
  const tier = score >= 75 ? "hi" : score >= 50 ? "mid" : "lo";
  return (
    <a
      href="#grace-ops-dock"
      className={`score-chip score-chip--${tier}`}
      onClick={(e) => {
        try {
          localStorage.setItem("graceops:active", "content");
        } catch {
          // ignore
        }
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
