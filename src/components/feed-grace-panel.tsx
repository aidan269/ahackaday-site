"use client";

import { useCallback, useEffect, useId, useRef } from "react";

import { graceDeepLink, getGraceOrigin, getPublicSiteUrl } from "@/lib/ecosystem";
import type { FeedBarQuery } from "@/lib/feed-url";
import { serializeFeedBarQuery } from "@/lib/feed-url";

const PROMPTS = [
  "What's the through-line across these incidents?",
  "Cluster by attacker behaviour",
  "Anything I should escalate before standup?",
  "Which 3 are most likely false positives?",
] as const;

function buildFeedContextUrl(query: FeedBarQuery, slugs: string[]): string {
  const site = getPublicSiteUrl();
  const qs = serializeFeedBarQuery(query);
  const slugPart = slugs.length ? `&context_slugs=${encodeURIComponent(slugs.slice(0, 40).join(","))}` : "";
  return `${site}/?${qs}${slugPart}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  query: FeedBarQuery;
  filteredCount: number;
  filteredSlugs: string[];
};

export function FeedGracePanel({ open, onClose, query, filteredCount, filteredSlugs }: Props) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const openGrace = useCallback(
    (prompt?: string) => {
      const origin = getGraceOrigin();
      const base = buildFeedContextUrl(query, filteredSlugs);
      const url = prompt ? `${base}#prompt=${encodeURIComponent(prompt)}` : base;
      const href = graceDeepLink(url);
      if (href) window.open(href, "_blank", "noopener,noreferrer");
      onClose();
    },
    [filteredSlugs, onClose, query],
  );

  if (!open) return null;

  return (
    <div className="feed-grace-dock" role="presentation">
      <button type="button" className="feed-grace-dock__backdrop" aria-label="Close" onClick={onClose} />
      <div
        id={panelId}
        className="feed-grace-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${panelId}-title`}
      >
        <div className="feed-grace-panel__head">
          <h2 id={`${panelId}-title`} className="feed-grace-panel__title">
            Ask Grace · feed scope
          </h2>
          <button ref={closeBtnRef} type="button" className="feed-grace-panel__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="feed-grace-panel__intro">
          Scoped to <b>{filteredCount}</b> incidents matching your filters. Opens Grace with this feed view as context.
        </p>
        {!getGraceOrigin() && process.env.NODE_ENV === "development" ? (
          <p className="feed-grace-panel__warn">Set NEXT_PUBLIC_GRACE_ORIGIN in .env.local to enable deep links.</p>
        ) : null}
        <ul className="feed-grace-panel__prompts">
          {PROMPTS.map((text) => (
            <li key={text}>
              <button type="button" className="feed-grace-panel__prompt" onClick={() => openGrace(text)}>
                {text}
              </button>
            </li>
          ))}
        </ul>
        <div className="feed-grace-panel__actions">
          <button type="button" className="feed-grace-panel__primary" onClick={() => openGrace()}>
            Open Grace with feed context
          </button>
        </div>
      </div>
    </div>
  );
}
