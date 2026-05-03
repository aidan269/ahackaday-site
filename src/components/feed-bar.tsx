"use client";

import "@/app/feed-bar.css";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { FeedGracePanel } from "@/components/feed-grace-panel";
import { ToolkitDrawer } from "@/components/toolkit-drawer";
import { graceAvatarUrl } from "@/lib/ecosystem";
import { countActiveFeedChips } from "@/lib/feed-receipt";
import { DEFAULT_FEED_QUERY, mergeFeedQuery, parseFeedBarQuery, serializeFeedBarQuery, type FeedBarQuery } from "@/lib/feed-url";

const WINDOW_OPTS = [
  { value: "7", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "all time" },
] as const;

const SOCIAL_OPTS = [
  { value: "all", label: "All sources" },
  { value: "twitter-mentions", label: "X · high mentions" },
  { value: "reddit-mentions", label: "Reddit · high mentions" },
  { value: "github-mentions", label: "GitHub · high mentions" },
] as const;

const VOTES_OPTS = [
  { value: "all", label: "All activity" },
  { value: "upvoted", label: "Upvoted" },
  { value: "downvoted", label: "Downvoted" },
  { value: "comments", label: "With comments" },
] as const;

const FOCUS_OPTS = [
  { value: "all", label: "All lenses" },
  { value: "ai", label: "AI / agents" },
  { value: "government", label: "Government / KEV" },
  { value: "missed", label: "Missed on X" },
  { value: "cisco", label: "Cisco" },
  { value: "google", label: "Google" },
  { value: "microsoft", label: "Microsoft" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
] as const;

const SORT_OPTS = [
  { value: "date", label: "newest" },
  { value: "community", label: "community" },
] as const;

const SAVE_VIEW_KEY = "ahackaday-saved-feed-view-v1";

function useDebouncedSearchCommit(commit: (patch: Partial<FeedBarQuery>) => void, ms: number) {
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (q: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        commitRef.current({ q });
      }, ms);
    },
    [ms],
  );
}

type ChipMenuProps = {
  id: string;
  label: React.ReactNode;
  isSet: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: React.ReactNode;
  variant?: "chip" | "sort";
};

function ChipMenu({ id, label, isSet, open, onOpen, onClose, children, variant = "chip" }: ChipMenuProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  const btnClass = variant === "sort" ? `fb-sort${isSet ? " set" : ""}` : `fb-chip${isSet ? " set" : ""}`;
  const caretClass = variant === "sort" ? "fb-sort__caret" : "fb-chip__caret";
  return (
    <div className="fb-chip-wrap" ref={wrapRef}>
      <button
        type="button"
        className={btnClass}
        id={`${id}-btn`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? onClose() : onOpen())}
      >
        {label}
        <span className={caretClass} aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="fb-menu" role="menu" aria-labelledby={`${id}-btn`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

type FeedBarProps = {
  receiptCount: number;
  receiptTotal: number;
  receiptEmphasis: string[];
  filteredSlugs: string[];
};

export function FeedBar({ receiptCount, receiptTotal, receiptEmphasis, filteredSlugs }: FeedBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [graceOpen, setGraceOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const query = useMemo(() => parseFeedBarQuery(searchParams), [searchParams]);

  const commit = useCallback(
    (patch: Partial<FeedBarQuery>) => {
      const merged = mergeFeedQuery(query, patch);
      const qs = serializeFeedBarQuery(merged);
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname || "/");
      });
    },
    [pathname, query, router],
  );

  const debouncedCommitQ = useDebouncedSearchCommit(commit, 380);

  const [qInput, setQInput] = useState(query.q);
  useEffect(() => {
    setQInput(query.q);
  }, [query.q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const windowLabel = WINDOW_OPTS.find((o) => o.value === query.window)?.label ?? "30 days";
  const socialOpt = SOCIAL_OPTS.find((o) => o.value === query.social);
  const votesOpt = VOTES_OPTS.find((o) => o.value === query.votes);
  const focusOpt = FOCUS_OPTS.find((o) => o.value === query.focus);
  const sortOpt = SORT_OPTS.find((o) => o.value === query.sort);

  const chipsActive = countActiveFeedChips(query);

  const onSaveView = () => {
    try {
      localStorage.setItem(SAVE_VIEW_KEY, serializeFeedBarQuery(query));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2400);
    } catch {
      /* ignore */
    }
  };

  const emphasisText = receiptEmphasis.join(" · ");
  const graceSubtitle = `about these ${receiptCount}`;

  return (
    <div>
      <div className={`feed-bar${pending ? " is-pending" : ""}`}>
        <div className="fb-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            name="q"
            value={qInput}
            aria-label="Search incidents"
            placeholder="Search incidents, CVEs, vendors, IOCs…"
            onChange={(e) => {
              const v = e.target.value;
              setQInput(v);
              debouncedCommitQ(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setQInput("");
                commit({ q: "" });
              }
            }}
          />
          <span className="kbd" aria-hidden>
            ⌘K
          </span>
        </div>

        <div className="fb-div" aria-hidden />

        <div className="fb-filters">
          <ChipMenu
            id="fb-win"
            label={<>{query.window === DEFAULT_FEED_QUERY.window ? windowLabel : <b>{windowLabel}</b>}</>}
            isSet={query.window !== DEFAULT_FEED_QUERY.window}
            open={openMenu === "window"}
            onOpen={() => setOpenMenu("window")}
            onClose={() => setOpenMenu(null)}
          >
            {WINDOW_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={query.window === o.value}
                onClick={() => {
                  commit({ window: o.value });
                  setOpenMenu(null);
                }}
              >
                {o.label}
              </button>
            ))}
          </ChipMenu>

          <ChipMenu
            id="fb-src"
            label={
              query.social === "all" ? (
                "Source"
              ) : (
                <b>
                  {query.social === "twitter-mentions"
                    ? "X"
                    : query.social === "reddit-mentions"
                      ? "Reddit"
                      : query.social === "github-mentions"
                        ? "GitHub"
                        : (socialOpt?.label ?? "Source")}
                </b>
              )
            }
            isSet={query.social !== "all"}
            open={openMenu === "social"}
            onOpen={() => setOpenMenu("social")}
            onClose={() => setOpenMenu(null)}
          >
            {SOCIAL_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={query.social === o.value}
                onClick={() => {
                  commit({ social: o.value });
                  setOpenMenu(null);
                }}
              >
                {o.label}
              </button>
            ))}
          </ChipMenu>

          <ChipMenu
            id="fb-act"
            label={query.votes === "all" ? "Activity" : <b>{votesOpt?.label}</b>}
            isSet={query.votes !== "all"}
            open={openMenu === "votes"}
            onOpen={() => setOpenMenu("votes")}
            onClose={() => setOpenMenu(null)}
          >
            {VOTES_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={query.votes === o.value}
                onClick={() => {
                  commit({ votes: o.value });
                  setOpenMenu(null);
                }}
              >
                {o.label}
              </button>
            ))}
          </ChipMenu>

          <ChipMenu
            id="fb-lens"
            label={query.focus === "all" ? "Lens" : <b>{focusOpt?.label}</b>}
            isSet={query.focus !== "all"}
            open={openMenu === "focus"}
            onOpen={() => setOpenMenu("focus")}
            onClose={() => setOpenMenu(null)}
          >
            {FOCUS_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={query.focus === o.value}
                onClick={() => {
                  commit({ focus: o.value });
                  setOpenMenu(null);
                }}
              >
                {o.label}
              </button>
            ))}
          </ChipMenu>

          {chipsActive > 0 ? (
            <button
              type="button"
              className="fb-clear"
              onClick={() => commit(mergeFeedQuery(DEFAULT_FEED_QUERY, { layout: query.layout }))}
            >
              <u>clear all</u>
            </button>
          ) : null}
        </div>

        <div className="fb-spacer" />

        <div className="fb-right">
          <ChipMenu
            id="fb-sort"
            variant="sort"
            label={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span className="fb-sort__lbl">sort</span>
                <span>
                  {query.sort === "date" ? sortOpt?.label : <b>{sortOpt?.label}</b>}
                </span>
              </span>
            }
            isSet={query.sort !== "date"}
            open={openMenu === "sort"}
            onOpen={() => setOpenMenu("sort")}
            onClose={() => setOpenMenu(null)}
          >
            {SORT_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={query.sort === o.value}
                onClick={() => {
                  commit({ sort: o.value });
                  setOpenMenu(null);
                }}
              >
                {o.label}
              </button>
            ))}
          </ChipMenu>

          <div className="fb-views" role="radiogroup" aria-label="Layout">
            <button
              type="button"
              className="fb-view"
              role="radio"
              aria-checked={query.layout === "card"}
              onClick={() => commit({ layout: "card" })}
              title="Card view"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <rect x="1" y="2" width="6" height="5" rx="1" />
                <rect x="9" y="2" width="6" height="5" rx="1" />
                <rect x="1" y="9" width="14" height="5" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              className="fb-view"
              role="radio"
              aria-checked={query.layout === "compact"}
              onClick={() => commit({ layout: "compact" })}
              title="Compact cards"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <rect x="1" y="2" width="14" height="3" rx="0.5" />
                <rect x="1" y="6.5" width="14" height="3" rx="0.5" />
                <rect x="1" y="11" width="14" height="3" rx="0.5" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="fb-grace"
            aria-label={`Open Grace scoped to ${receiptCount} filtered incidents`}
            onClick={() => setGraceOpen(true)}
          >
            <span className="fb-grace__avatar" aria-hidden>
              <Image
                className="fb-grace__avatar-img"
                src={graceAvatarUrl()}
                alt=""
                width={22}
                height={22}
              />
              <span className="pulse" aria-hidden />
            </span>
            <span className="fb-grace__txt">
              Ask Grace
              <em>{graceSubtitle}</em>
            </span>
          </button>

          <ToolkitDrawer launchClassName="feed-bar__toolkit" />

          <button type="button" className="fb-save" aria-label="Save this filter view" title="Save view" onClick={onSaveView}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
              <path d="M4 2.5h8v11L8 9.9 4 13.5v-11z" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="fb-result" aria-live="polite" aria-atomic="true">
        <span>
          <b>{receiptCount}</b> incidents · <em>{emphasisText}</em>
        </span>
        <span>
          {savedFlash ? <span className="fb-result__saved">view saved</span> : null}
          {!savedFlash ? (
            <>
              <span style={{ opacity: 0.85 }}>updated live</span>
            </>
          ) : null}
        </span>
      </div>

      <FeedGracePanel
        open={graceOpen}
        onClose={() => setGraceOpen(false)}
        query={query}
        filteredCount={receiptCount}
        filteredSlugs={filteredSlugs}
      />
    </div>
  );
}
