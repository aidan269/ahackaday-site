"use client";

import type { CSSProperties } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { useEmotionalPreferences } from "@/components/emotional-preferences-provider";
import { buildFeedHref } from "@/lib/feed-nav";
import type { SidebarCounts } from "@/lib/sidebar-counts";

type Props = { counts: SidebarCounts };

type UrlFilters = {
  severity: string;
  exploited: boolean;
  mitigated: boolean;
  window: string;
};

const DEFAULT_FILTERS: UrlFilters = {
  severity: "all",
  exploited: false,
  mitigated: false,
  window: "30d",
};

function readFilters(search: URLSearchParams): UrlFilters {
  const ex = search.get("exploited");
  const mit = search.get("mitigated");
  return {
    severity: search.get("severity") ?? "all",
    exploited: ex === "1" || ex?.toLowerCase() === "true",
    mitigated: mit === "1" || mit?.toLowerCase() === "true",
    window: search.get("window") ?? "30d",
  };
}

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

function SidebarBody({ counts, filters }: Props & { filters: UrlFilters }) {
  const pathname = usePathname();
  const { reviewCount, savedCount } = useEmotionalPreferences();

  const isFeed = pathname === "/";
  const isCalendar = pathname.startsWith("/calendar");
  const isRss = pathname === "/feed.xml";
  const isSaved = pathname === "/saved";

  const feedHomeHref = buildFeedHref({});
  const sevActive = (sev: string) => isFeed && filters.severity === sev && !filters.exploited && !filters.mitigated;
  const exploitedActive = isFeed && filters.exploited;
  const last7Active = isFeed && filters.window === "7d" && !filters.exploited && !filters.mitigated;
  const mitigatedActive = isFeed && filters.mitigated;

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <Link href="https://cantina.security" target="_blank" rel="noreferrer" className="sidebar__brand">
        <span className="sidebar__brand-logo-wrap" aria-hidden>
          <img src="/cantina-logo.svg" alt="Cantina Security" className="sidebar__brand-logo" />
        </span>
        <span className="sidebar__brand-wordmark">Cantina Security</span>
      </Link>

      <div className="sidebar__section-label">workspace</div>
      <nav className="sidebar__nav" aria-label="Workspace">
        <Link href={feedHomeHref} className={`sidebar__item${isFeed ? " is-active" : ""}`}>
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
        <Link href="/saved" className={`sidebar__item${isSaved ? " is-active" : ""}`}>
          <span className="sidebar__icon" aria-hidden>
            <IconSaved />
          </span>
          <span>saved</span>
          <span className="sidebar__count">{savedCount}</span>
        </Link>
      </nav>

      <div className="sidebar__section-label">severity</div>
      <nav className="sidebar__nav" aria-label="Severity shortcuts">
        <Link
          href={buildFeedHref({ severity: "critical" })}
          className={`sidebar__item${sevActive("critical") ? " is-active" : ""}`}
        >
          <span className="sidebar__sev-dot" style={{ ["--sev" as string]: "var(--sev-critical)" } as CSSProperties} />
          <span>critical</span>
          <span className="sidebar__count">{counts.critical}</span>
        </Link>
        <Link href={buildFeedHref({ severity: "high" })} className={`sidebar__item${sevActive("high") ? " is-active" : ""}`}>
          <span className="sidebar__sev-dot" style={{ ["--sev" as string]: "var(--sev-high)" } as CSSProperties} />
          <span>high</span>
          <span className="sidebar__count">{counts.high}</span>
        </Link>
        <Link href={buildFeedHref({ severity: "medium" })} className={`sidebar__item${sevActive("medium") ? " is-active" : ""}`}>
          <span className="sidebar__sev-dot" style={{ ["--sev" as string]: "var(--sev-medium)" } as CSSProperties} />
          <span>medium</span>
          <span className="sidebar__count">{counts.medium}</span>
        </Link>
        <Link href={buildFeedHref({ severity: "low" })} className={`sidebar__item${sevActive("low") ? " is-active" : ""}`}>
          <span className="sidebar__sev-dot" style={{ ["--sev" as string]: "var(--sev-low)" } as CSSProperties} />
          <span>low</span>
          <span className="sidebar__count">{counts.low}</span>
        </Link>
      </nav>

      <div className="sidebar__section-label">filters</div>
      <nav className="sidebar__nav" aria-label="Feed filters">
        <Link href={buildFeedHref({ exploited: true })} className={`sidebar__item${exploitedActive ? " is-active" : ""}`}>
          <span className="sidebar__icon" aria-hidden>
            <IconExploited />
          </span>
          <span>exploited</span>
          <span className="sidebar__count">{counts.exploited}</span>
        </Link>
        <Link href={buildFeedHref({ window: "7d" })} className={`sidebar__item${last7Active ? " is-active" : ""}`}>
          <span className="sidebar__icon" aria-hidden>
            <IconClock />
          </span>
          <span>last 7 days</span>
          <span className="sidebar__count">{counts.last7d}</span>
        </Link>
        <Link href={buildFeedHref({ mitigated: true })} className={`sidebar__item${mitigatedActive ? " is-active" : ""}`}>
          <span className="sidebar__icon" aria-hidden>
            <IconMitigated />
          </span>
          <span>mitigated</span>
          <span className="sidebar__count">{counts.mitigated}</span>
        </Link>
      </nav>

      <div className="sidebar__section-label sidebar__section-label--receipts">your work</div>
      <div className="sidebar__receipts">
        You&apos;ve reviewed <span className="sidebar__receipts-num">{reviewCount}</span> incidents this month.{" "}
        <strong>Tight ship.</strong>
      </div>

      <div className="sidebar__status">
        <span className="sidebar__status-dot" aria-hidden />
        <span>Powered by Cantina Security</span>
      </div>
    </aside>
  );
}

function SidebarWithSearchParams({ counts }: Props) {
  const search = useSearchParams();
  const filters = readFilters(search);
  return <SidebarBody counts={counts} filters={filters} />;
}

export function Sidebar({ counts }: Props) {
  return (
    <Suspense fallback={<SidebarBody counts={counts} filters={DEFAULT_FILTERS} />}>
      <SidebarWithSearchParams counts={counts} />
    </Suspense>
  );
}
