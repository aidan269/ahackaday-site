"use client";

import { useMemo, useState } from "react";

type PlatformKey = "x" | "reddit" | "github";

type PlatformPoint = {
  id: PlatformKey;
  label: string;
  count: number;
  href: string;
};

type SocialPlatformGraphProps = {
  totalMentions: number;
  split: { x: number; reddit: number; github: number };
  searchTerm: string;
};

export function SocialPlatformGraph({ totalMentions, split, searchTerm }: SocialPlatformGraphProps) {
  const [active, setActive] = useState<PlatformKey>("x");
  const points = useMemo<PlatformPoint[]>(() => {
    const toCount = (share: number) => Math.max(0, Math.round((totalMentions * share) / 100));
    const query = encodeURIComponent(searchTerm.trim() || "cybersecurity");
    return [
      {
        id: "x",
        label: "twitter",
        count: toCount(split.x),
        href: `https://x.com/search?q=${query}&f=live`,
      },
      {
        id: "reddit",
        label: "reddit",
        count: toCount(split.reddit),
        href: `https://www.reddit.com/search/?q=${query}&sort=new&t=day`,
      },
      {
        id: "github",
        label: "github",
        count: toCount(split.github),
        href: `https://github.com/search?q=${query}+is%3Aissue&type=issues`,
      },
    ];
  }, [searchTerm, split.github, split.reddit, split.x, totalMentions]);

  const maxCount = Math.max(1, ...points.map((item) => item.count));

  return (
    <div className="social-graph">
      <div className="social-graph__tabs" role="tablist" aria-label="Social platforms">
        {points.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            className={`social-graph__tab${active === item.id ? " is-active" : ""}`}
            onClick={() => setActive(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="social-graph__bars">
        {points.map((item) => (
          <a
            key={item.id}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className={`social-graph__row${active === item.id ? " is-active" : ""}`}
            title={`Open ${item.label} results`}
          >
            <span className="social-graph__label">{item.label}</span>
            <span className="social-graph__track">
              <span
                className="social-graph__fill"
                style={{ width: `${Math.max(8, Math.round((item.count / maxCount) * 100))}%` }}
              />
            </span>
            <span className="social-graph__value">{item.count}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
