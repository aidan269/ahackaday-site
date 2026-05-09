"use client";

import type { TopicQueueItem } from "../types";

const KINDS: { icon: string; label: string; target: string }[] = [
  { icon: "!", label: "Explainer", target: "SEARCH" },
  { icon: "i", label: "Rollup", target: "RESEARCH" },
  { icon: ">", label: "Comparison", target: "ENGAGEMENT" },
  { icon: "#", label: "Digest", target: "NEWSLETTER" },
];

export function TopicTracks({ topics }: { topics: TopicQueueItem[] }) {
  if (topics.length === 0) return null;

  async function spinDraft(topic: TopicQueueItem) {
    const res = await fetch("/api/cms/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ h1: topic.draft_h1, tldr: topic.draft_tldr_40w }),
    });
    if (res.status === 501) {
      window.alert("Draft CMS is not wired yet — copy the TL;DR manually.");
      return;
    }
    const j = await res.json().catch(() => ({}));
    window.alert((j as { error?: string }).error || "Request failed");
  }

  return (
    <div className="content-topic-grid">
      {topics.map((topic, idx) => {
        const meta = KINDS[idx % KINDS.length];
        return (
          <article key={`${topic.target_query}-${idx}`} className="content-topic-card">
            <div className="content-topic-card__hd">
              <span className={`content-topic-icon content-topic-icon--${idx % 4}`}>{meta.icon}</span>
              <div>
                <div className="content-topic-kind">{meta.label}</div>
                <div className="content-topic-target">
                  target <b>{meta.target}</b>
                </div>
              </div>
            </div>
            <p className="content-topic-query"><strong>{topic.target_query}</strong></p>
            <p className="content-topic-tldr">{topic.draft_tldr_40w}</p>
            <button type="button" className="btn-primary content-topic-spin" onClick={() => void spinDraft(topic)}>
              spin up draft
            </button>
          </article>
        );
      })}
    </div>
  );
}
