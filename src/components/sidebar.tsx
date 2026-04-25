"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { SidebarCounts } from "@/lib/sidebar-counts";

type Props = { counts: SidebarCounts };

function IconFeed() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="1.5" y="2" width="11" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <rect x="1.5" y="5.75" width="11" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <rect x="1.5" y="9.5" width="11" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="2" y="3" width="10" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M2 5.5h10" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 1.5v2M9.5 1.5v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M5 8l1.2 1.2L9 6.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRss() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M3 10a7 7 0 0 1 7-7" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M3 6a4 4 0 0 1 4-4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <circle cx="3.5" cy="10.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function IconSaved() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M3.5 2.5h7v9L7 8.8 3.5 11.5v-9z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconExploited() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M7 2.5v7M7 9.5l-2.5 2M7 9.5l2.5 2" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M7 4.5V7l2 1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconMitigated() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M3 7.2l2.8 2.8L11 4.8" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function utcTimeLabel(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function Sidebar({ counts }: Props) {
  const pathname = usePathname();
  const [utcClock, setUtcClock] = useState(() => utcTimeLabel(new Date()));

  useEffect(() => {
    const id = setInterval(() => setUtcClock(utcTimeLabel(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  const isFeed = pathname === "/";
  const isCalendar = pathname.startsWith("/calendar");
  const isRss = pathname === "/feed.xml";

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <Link href="/" className="sidebar__brand">
        <span className="sidebar__brand-badge" aria-hidden />
        <span className="sidebar__brand-wordmark">
          <span className="sidebar__brand-strong">ahackaday</span>
          <span className="sidebar__brand-dot">.</span>
          <span className="sidebar__brand-muted">feed</span>
        </span>
      </Link>

      <div className="sidebar__section-label">workspace</div>
      <nav className="sidebar__nav" aria-label="Workspace">
        <Link href="/" className={`sidebar__item${isFeed ? " is-active" : ""}`}>
          <span className="sidebar__icon" aria-hidden>
            <IconFeed />
          </span>
          <span>feed</span>
          <span className="sidebar__count">{counts.all}</span>
        </Link>
        <Link href="/calendar" className={`sidebar__item${isCalendar ? " is-active" : ""}`}>
          <span className="sidebar__icon" aria-hidden>
            <IconCalendar />
          </span>
          <span>calendar</span>
        </Link>
        <Link href="/feed.xml" className={`sidebar__item${isRss ? " is-active" : ""}`}>
          <span className="sidebar__icon" aria-hidden>
            <IconRss />
          </span>
          <span>rss</span>
        </Link>
        <span className="sidebar__item sidebar__item--stub" title="Coming soon">
          <span className="sidebar__icon" aria-hidden>
            <IconSaved />
          </span>
          <span>saved</span>
        </span>
      </nav>

      <div className="sidebar__section-label">severity</div>
      <div className="sidebar__nav" role="list">
        <div className="sidebar__row sidebar__row--stub" role="listitem">
          <span className="sidebar__sev-dot" style={{ ["--sev" as string]: "var(--sev-critical)" } as CSSProperties} />
          <span>critical</span>
          <span className="sidebar__count">{counts.critical}</span>
        </div>
        <div className="sidebar__row sidebar__row--stub" role="listitem">
          <span className="sidebar__sev-dot" style={{ ["--sev" as string]: "var(--sev-high)" } as CSSProperties} />
          <span>high</span>
          <span className="sidebar__count">{counts.high}</span>
        </div>
        <div className="sidebar__row sidebar__row--stub" role="listitem">
          <span className="sidebar__sev-dot" style={{ ["--sev" as string]: "var(--sev-medium)" } as CSSProperties} />
          <span>medium</span>
          <span className="sidebar__count">{counts.medium}</span>
        </div>
        <div className="sidebar__row sidebar__row--stub" role="listitem">
          <span className="sidebar__sev-dot" style={{ ["--sev" as string]: "var(--sev-low)" } as CSSProperties} />
          <span>low</span>
          <span className="sidebar__count">{counts.low}</span>
        </div>
      </div>

      <div className="sidebar__section-label">filters</div>
      <div className="sidebar__nav">
        <div className="sidebar__row sidebar__row--stub">
          <span className="sidebar__icon" aria-hidden>
            <IconExploited />
          </span>
          <span>exploited</span>
          <span className="sidebar__count">{counts.exploited}</span>
        </div>
        <div className="sidebar__row sidebar__row--stub">
          <span className="sidebar__icon" aria-hidden>
            <IconClock />
          </span>
          <span>last 7 days</span>
          <span className="sidebar__count">{counts.last7d}</span>
        </div>
        <div className="sidebar__row sidebar__row--stub">
          <span className="sidebar__icon" aria-hidden>
            <IconMitigated />
          </span>
          <span>mitigated</span>
          <span className="sidebar__count">{counts.mitigated}</span>
        </div>
      </div>

      <div className="sidebar__status">
        <span className="sidebar__status-dot" aria-hidden />
        <span>
          live · {utcClock} UTC
        </span>
      </div>
    </aside>
  );
}
