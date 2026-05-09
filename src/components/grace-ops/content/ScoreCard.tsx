"use client";

import { useCallback } from "react";

import type { ContentData } from "../types";

export function ScoreCard({ data }: { data: ContentData }) {
  const copyJson = useCallback(async () => {
    const payload = {
      total_score: data.total_score,
      sub_scores: data.sub_scores,
      one_line_diagnosis: data.one_line_diagnosis,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch {
      // ignore
    }
  }, [data]);

  const tier = data.total_score >= 75 ? "high" : data.total_score >= 50 ? "mid" : "low";
  const rows: { key: keyof ContentData["sub_scores"]; label: string; max: number }[] = [
    { key: "direct_answer", label: "Direct answer", max: 20 },
    { key: "statistics", label: "Statistics", max: 20 },
    { key: "structure", label: "Structure", max: 15 },
    { key: "authority", label: "Authority", max: 15 },
    { key: "freshness", label: "Freshness", max: 15 },
    { key: "topical_depth", label: "Topical depth", max: 15 },
  ];

  return (
    <div className={`content-score content-score--${tier}`}>
      <div className="content-score__hero">
        <div className="content-score__num">{data.total_score}</div>
        <div className="content-score__suffix">/ 100</div>
        <button type="button" className="btn-quiet content-score__json" onClick={() => void copyJson()}>
          json
        </button>
      </div>
      <p className="content-score__diagnosis">{data.one_line_diagnosis}</p>
      {data.low_content ? (
        <p className="content-score__warn">Low surface area (&lt; 50 words scored) — expand the article body for fairer scoring.</p>
      ) : null}
      <ul className="content-score__subs">
        {rows.map((row) => {
          const v = data.sub_scores[row.key];
          const pct = Math.round((v / row.max) * 100);
          return (
            <li key={row.key} className="content-score__sub">
              <div className="content-score__sub-hd">
                <span>{row.label}</span>
                <span className="content-score__sub-val">
                  {v}/{row.max}
                </span>
              </div>
              <div className="content-score__bar-track">
                <span className="content-score__bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
