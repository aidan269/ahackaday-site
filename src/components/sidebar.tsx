"use client";

import type { CSSProperties } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { useEmotionalPreferences } from "@/components/emotional-preferences-provider";
import { COMPANY_FOCUS_IDS, type CompanyFocusId } from "@/lib/focus-lenses";
import { buildFeedHref } from "@/lib/feed-nav";
import type { SidebarCounts } from "@/lib/sidebar-counts";

type Props = { counts: SidebarCounts };

type UrlFilters = {
  severity: string;
  type: string;
  focus: string;
  exploited: boolean;
  mitigated: boolean;
  window: string;
};

const DEFAULT_FILTERS: UrlFilters = {
  severity: "all",
  type: "all",
  focus: "all",
  exploited: false,
  mitigated: false,
  window: "30d",
};

function readFilters(search: URLSearchParams): UrlFilters {
  const ex = search.get("exploited");
  const mit = search.get("mitigated");
  return {
    severity: search.get("severity") ?? "all",
    type: search.get("type") ?? "all",
    focus: search.get("focus") ?? "all",
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
      <circle cx="7" cy="7" r="4.8" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M7 4.1V7l2.2 1.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="7" cy="7" r="0.7" fill="currentColor" />
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

function IconZeroDay() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M8 1.5L6.2 5.4l-3.8 1.2 3.8 1.2L8 12.5l1.8-4.7 3.8-1.2-3.8-1.2L8 1.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRansomware() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="4" y="6.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M5 6.5V5a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <circle cx="7" cy="9.8" r="0.9" fill="currentColor" />
    </svg>
  );
}

function IconAI() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="4" y="4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <circle cx="6.2" cy="6.5" r="0.7" fill="currentColor" />
      <circle cx="8.8" cy="6.5" r="0.7" fill="currentColor" />
      <path d="M6 8.3h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7 2v1.2M11 7h1.2M1.8 7H3M9.8 3.2l.9-.9M3.3 10.7l.9-.9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function IconGovernment() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M2 5.2L7 2.4l5 2.8v.8H2v-.8z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <path d="M3.4 6.2v3.4M5.8 6.2v3.4M8.2 6.2v3.4M10.6 6.2v3.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M2.6 10.6h8.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconVendor() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M3 12V5.2L7 3l4 2.2V12"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M3 12h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M6 12V8.5h2V12" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

/** Lowercase labels to match other focus rows (zero-day, ai, government). */
const COMPANY_FOCUS_LABELS: Record<CompanyFocusId, string> = {
  cisco: "cisco",
  google: "google",
  microsoft: "microsoft",
  anthropic: "anthropic",
  openai: "openai",
};

function SidebarBody({ counts, filters }: Props & { filters: UrlFilters }) {
  const pathname = usePathname();
  const { reviewCount, savedCount, userEmail } = useEmotionalPreferences();

  const isFeed = pathname === "/";
  const isCalendar = pathname.startsWith("/calendar");
  const isRss = pathname === "/zero-day-clock";
  const isSaved = pathname === "/saved";

  const feedHomeHref = buildFeedHref({});
  const typeClear = filters.type === "all";
  const sevActive = (sev: string) =>
    isFeed && filters.severity === sev && !filters.exploited && !filters.mitigated && typeClear;
  const zeroDayActive = isFeed && filters.type === "zero-day";
  const ransomwareActive = isFeed && filters.type === "ransomware";
  const aiActive = isFeed && filters.focus === "ai";
  const governmentActive = isFeed && filters.focus === "government";

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
        <Link href="/zero-day-clock" className={`sidebar__item${isRss ? " is-active" : ""}`}>
          <span className="sidebar__icon" aria-hidden>
            <IconRss />
          </span>
          <span>zero-day clock</span>
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
      </nav>

      <div className="sidebar__section-label">focus</div>
      <nav className="sidebar__nav" aria-label="Incident type shortcuts">
        <Link href={buildFeedHref({ type: "zero-day" })} className={`sidebar__item${zeroDayActive ? " is-active" : ""}`}>
          <span className="sidebar__icon" aria-hidden>
            <IconZeroDay />
          </span>
          <span>zero-day</span>
          <span className="sidebar__count">{counts.zeroDay}</span>
        </Link>
        <Link href={buildFeedHref({ type: "ransomware" })} className={`sidebar__item${ransomwareActive ? " is-active" : ""}`}>
          <span className="sidebar__icon" aria-hidden>
            <IconRansomware />
          </span>
          <span>ransomware</span>
          <span className="sidebar__count">{counts.ransomware}</span>
        </Link>
        <Link href={buildFeedHref({ focus: "ai" })} className={`sidebar__item${aiActive ? " is-active" : ""}`}>
          <span className="sidebar__icon" aria-hidden>
            <IconAI />
          </span>
          <span>ai</span>
          <span className="sidebar__count">{counts.ai}</span>
        </Link>
        <Link href={buildFeedHref({ focus: "government" })} className={`sidebar__item${governmentActive ? " is-active" : ""}`}>
          <span className="sidebar__icon" aria-hidden>
            <IconGovernment />
          </span>
          <span>government</span>
          <span className="sidebar__count">{counts.government}</span>
        </Link>
        {COMPANY_FOCUS_IDS.map((id) => (
          <Link
            key={id}
            href={buildFeedHref({ focus: id })}
            className={`sidebar__item${isFeed && filters.focus === id ? " is-active" : ""}`}
          >
            <span className="sidebar__icon" aria-hidden>
              <IconVendor />
            </span>
            <span>{COMPANY_FOCUS_LABELS[id]}</span>
            <span className="sidebar__count">{counts[id]}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar__section-label sidebar__section-label--receipts">your work</div>
      <div className="sidebar__receipts">
        You&apos;ve reviewed <span className="sidebar__receipts-num">{reviewCount}</span> incidents this month.{" "}
        <strong>Tight ship.</strong>
      </div>
      <Link href="/saved" className="sidebar__auth-cta">
        <span className="sidebar__auth-title">{userEmail ? "sync enabled" : "optional login"}</span>
        <span className="sidebar__auth-sub">
          {userEmail ? `signed in as ${userEmail}` : "Sign in once to save stories and vote across devices."}
        </span>
      </Link>

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
