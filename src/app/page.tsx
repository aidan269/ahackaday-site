import { DailyBriefHead } from "@/components/daily-brief-head";
import { FeedBar } from "@/components/feed-bar";
import { IncidentItem } from "@/components/incident-item";
import { QuietDayEmpty } from "@/components/quiet-day-empty";
import { graceAvatarUrl } from "@/lib/ecosystem";
import { matchesFocusLens, parseFocusLens } from "@/lib/focus-lenses";
import { computeCommunityScore, practitionerBadgeEligible } from "@/lib/community-score";
import {
  getIncidentCommentCountMap,
  getIncidentSaveCountMap,
  getIncidentVoteSummaryMap,
} from "@/lib/incident-votes";
import { buildFeedReceiptEmphasis } from "@/lib/feed-receipt";
import type { FeedBarQuery } from "@/lib/feed-url";
import { getAllIncidents, type IncidentType, type Severity } from "@/lib/incidents";
import type { SocialDataQuality } from "@/lib/incident-types";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

/** Refresh feed periodically (Supabase / markdown) so fixes and new rows surface without only redeploying. */
export const revalidate = 120;
export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(v: string | string[] | undefined, fallback: string): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0) return v[0] ?? fallback;
  return fallback;
}

type IncidentRow = Awaited<ReturnType<typeof getAllIncidents>>[number];
const FEED_COMMUNITY_SLUG_LIMIT = 250;
const GITHUB_FEED_TIMEOUT_MS = 1800;

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function getPlatformMentions(incident: IncidentRow, platform: "x" | "reddit" | "github"): number {
  if (incident.socialDataQuality !== "live_measured") return 0;
  if (typeof incident.socialMentions24h !== "number") return 0;
  const share = incident.socialPlatformSplit?.[platform];
  if (typeof share !== "number" || share <= 0) return 0;
  return Math.round((incident.socialMentions24h * share) / 100);
}

function redditMentionsSortScore(incident: IncidentRow): number {
  if (incident.socialDataQuality !== "live_measured") return 0;
  const total = incident.socialMentions24h ?? 0;
  const share = incident.socialPlatformSplit?.reddit ?? 0;
  return (total * share) / 100;
}

function estimatedRedditMentions(incident: IncidentRow): number {
  if (incident.socialDataQuality !== "live_measured") return 0;
  const total = incident.socialMentions24h ?? 0;
  const share = incident.socialPlatformSplit?.reddit ?? 0;
  return Math.max(0, Math.round((total * share) / 100));
}

function githubMentionsSortScore(incident: IncidentRow): number {
  if (incident.socialDataQuality !== "live_measured") return 0;
  const total = incident.socialMentions24h ?? 0;
  const share = incident.socialPlatformSplit?.github ?? 0;
  return (total * share) / 100;
}

function estimatedGithubMentions(incident: IncidentRow): number {
  if (incident.socialDataQuality !== "live_measured") return 0;
  const total = incident.socialMentions24h ?? 0;
  const share = incident.socialPlatformSplit?.github ?? 0;
  return Math.max(0, Math.round((total * share) / 100));
}

function redditRailShareLabel(incident: IncidentRow): string {
  const q = incident.socialDataQuality as SocialDataQuality | undefined;
  if (q === "live_measured" && incident.socialPlatformSplit) return `${incident.socialPlatformSplit.reddit}% on reddit`;
  if (q === "live_zero") return "scanned · 0 vol";
  return "pending scan";
}

function githubRailShareLabel(incident: IncidentRow): string {
  const q = incident.socialDataQuality as SocialDataQuality | undefined;
  if (q === "live_measured" && incident.socialPlatformSplit) return `${incident.socialPlatformSplit.github}% on github`;
  if (q === "live_zero") return "scanned · 0 vol";
  return "pending scan";
}

function redditMentionsLine(incident: IncidentRow): string {
  const q = incident.socialDataQuality as SocialDataQuality | undefined;
  if (q === "pending") return "pending scan";
  if (q === "live_zero") return "0 est. mentions";
  const n = estimatedRedditMentions(incident);
  return n > 0 ? `${formatCompactNumber(n)} est. mentions` : "<1 est. mentions";
}

function githubMentionsLine(incident: IncidentRow): string {
  const q = incident.socialDataQuality as SocialDataQuality | undefined;
  if (q === "pending") return "pending scan";
  if (q === "live_zero") return "0 est. mentions";
  const n = estimatedGithubMentions(incident);
  return n > 0 ? `${formatCompactNumber(n)} est. mentions` : "<1 est. mentions";
}

function total24hLine(incident: IncidentRow): string {
  if (incident.socialDataQuality === "pending") return "—";
  return `${formatCompactNumber(incident.socialMentions24h ?? 0)} total 24h`;
}

function socialQualityRank(i: IncidentRow): number {
  if (i.socialDataQuality === "live_measured") return 3;
  if (i.socialDataQuality === "live_zero") return 2;
  return 1;
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

type GracePluginFeedItem = {
  id: string;
  title: string;
  meta: string;
  href: string;
  tags: string[];
};

type GithubEvent = {
  id?: string;
  type?: string;
  created_at?: string;
  repo?: { name?: string };
  payload?: {
    size?: number;
    action?: string;
    ref_type?: string;
    ref?: string;
    pull_request?: { number?: number };
    issue?: { number?: number };
  };
};

function relativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "recent";
  const deltaSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (deltaSec < 60) return "just now";
  const min = Math.floor(deltaSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function pluginRelevance(repo: string, type: string): number {
  const name = repo.toLowerCase();
  let score = 0;
  if (name.includes("grace")) score += 5;
  if (name.includes("plugin")) score += 4;
  if (name.includes("mcp")) score += 3;
  if (type === "PushEvent") score += 2;
  if (type === "PullRequestEvent") score += 2;
  if (type === "IssuesEvent") score += 1;
  return score;
}

function eventToFeedItem(event: GithubEvent): GracePluginFeedItem | null {
  const type = String(event?.type ?? "");
  const repo = String(event?.repo?.name ?? "");
  const createdAt = String(event?.created_at ?? "");
  const rel = relativeTime(createdAt);
  const baseHref = repo ? `https://github.com/${repo}` : "https://github.com";

  if (!repo || !type) return null;

  if (type === "PushEvent") {
    const commits = Number(event?.payload?.size ?? 0);
    return {
      id: String(event.id ?? `${type}-${repo}-${createdAt}`),
      title: `Pushed ${commits || 1} commit${commits === 1 ? "" : "s"} to ${repo}`,
      meta: `${rel} · push`,
      href: `${baseHref}/commits`,
      tags: ["code"],
    };
  }
  if (type === "PullRequestEvent") {
    const action = String(event?.payload?.action ?? "updated");
    const prNumber = event?.payload?.pull_request?.number;
    return {
      id: String(event.id ?? `${type}-${repo}-${createdAt}`),
      title: `${action} PR #${prNumber ?? "?"} in ${repo}`,
      meta: `${rel} · pull request`,
      href: prNumber ? `${baseHref}/pull/${prNumber}` : `${baseHref}/pulls`,
      tags: ["review"],
    };
  }
  if (type === "IssuesEvent") {
    const action = String(event?.payload?.action ?? "updated");
    const issueNumber = event?.payload?.issue?.number;
    return {
      id: String(event.id ?? `${type}-${repo}-${createdAt}`),
      title: `${action} issue #${issueNumber ?? "?"} in ${repo}`,
      meta: `${rel} · issue`,
      href: issueNumber ? `${baseHref}/issues/${issueNumber}` : `${baseHref}/issues`,
      tags: ["ops"],
    };
  }
  if (type === "IssueCommentEvent") {
    const issueNumber = event?.payload?.issue?.number;
    return {
      id: String(event.id ?? `${type}-${repo}-${createdAt}`),
      title: `Commented on issue #${issueNumber ?? "?"} in ${repo}`,
      meta: `${rel} · discussion`,
      href: issueNumber ? `${baseHref}/issues/${issueNumber}` : `${baseHref}/issues`,
      tags: ["discussion"],
    };
  }
  if (type === "CreateEvent") {
    const refType = String(event?.payload?.ref_type ?? "ref");
    const ref = String(event?.payload?.ref ?? "");
    return {
      id: String(event.id ?? `${type}-${repo}-${createdAt}`),
      title: `Created ${refType}${ref ? ` ${ref}` : ""} in ${repo}`,
      meta: `${rel} · create`,
      href: baseHref,
      tags: ["setup"],
    };
  }
  return {
    id: String(event.id ?? `${type}-${repo}-${createdAt}`),
    title: `${type.replace(/Event$/, "")} activity in ${repo}`,
    meta: `${rel} · github`,
    href: baseHref,
    tags: ["activity"],
  };
}

async function getGracePluginFeed(username: string): Promise<GracePluginFeedItem[]> {
  if (!username) return [];
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_FEED_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=40`, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: 300 },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const events = (await res.json()) as GithubEvent[];
    return events
      .map((event) => ({
        event,
        item: eventToFeedItem(event),
        score: pluginRelevance(String(event?.repo?.name ?? ""), String(event?.type ?? "")),
      }))
      .filter((x): x is { event: GithubEvent; item: GracePluginFeedItem; score: number } => Boolean(x.item))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return Date.parse(String(b.event?.created_at ?? "")) - Date.parse(String(a.event?.created_at ?? ""));
      })
      .slice(0, 8)
      .map((x) => x.item);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const query = readParam(params.q, "");
  const severity = readParam(params.severity, "all");
  const typeValue = readParam(params.type, "all");
  const socialValue = readParam(params.social, "all");
  const focusValue = readParam(params.focus, "all");
  const voteValue = readParam(params.votes, "all");
  const sortValue = readParam(params.sort, "date");
  const windowValue = readParam(params.window, "30d");
  const layoutParam = readParam(params.layout, "card");
  /** `layout=timeline` is retired; treat like card. */
  const layoutMode = layoutParam === "compact" ? "compact" : "card";
  const severityValue = severity as "all" | Severity;
  const typeFilter = typeValue as "all" | IncidentType;
  const focusFilter = parseFocusLens(focusValue);
  const win = (windowValue === "7d" ? "7" : windowValue) as "7" | "30d" | "90d" | "all";

  const feedQuery: FeedBarQuery = {
    q: query,
    severity,
    type: typeValue,
    social: socialValue,
    votes: voteValue,
    focus: focusFilter,
    sort: sortValue,
    window: win,
    layout: layoutMode,
  };

  const githubUsername = process.env.GITHUB_USERNAME || process.env.NEXT_PUBLIC_GITHUB_USERNAME || "aidan269";
  const [all, gracePluginFeed] = await Promise.all([
    getAllIncidents(),
    getGracePluginFeed(githubUsername),
  ]);
  const allSlugs = all.map((incident) => incident.slug);
  const communitySlugs = allSlugs.slice(0, FEED_COMMUNITY_SLUG_LIMIT);
  const [voteSummaryMap, commentCountMap, saveCountMap] = await Promise.all([
    getIncidentVoteSummaryMap(communitySlugs),
    getIncidentCommentCountMap(communitySlugs),
    getIncidentSaveCountMap(communitySlugs),
  ]);
  const communityMap = new Map<string, number>();
  const practitionerMap = new Map<string, boolean>();
  for (const slug of allSlugs) {
    const votes = voteSummaryMap.get(slug) ?? { upvotes: 0, downvotes: 0, score: 0 };
    const comments = commentCountMap.get(slug) ?? 0;
    const saves = saveCountMap.get(slug) ?? 0;
    const score = computeCommunityScore({ voteScore: votes.score, commentCount: comments, saveCount: saves });
    communityMap.set(slug, score);
    practitionerMap.set(
      slug,
      practitionerBadgeEligible({ communityScore: score, upvotes: votes.upvotes }),
    );
  }
  const now = new Date();
  const qq = query.trim().toLowerCase();
  const days = win === "all" ? null : parseInt(win, 10);
  const parseLocal = (date: string) => {
    const [y, m, d] = date.slice(0, 10).split("-").map((n) => Number.parseInt(n, 10));
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return new Date(date);
    return new Date(y, m - 1, d);
  };
  const filtered = all.filter((i) => {
    if (severityValue !== "all" && i.severity !== severityValue) return false;
    if (typeFilter !== "all" && i.category !== typeFilter) return false;
    if (!matchesFocusLens(i, focusFilter, communityMap.get(i.slug) ?? 0)) return false;
    const voteSummary = voteSummaryMap.get(i.slug) ?? { upvotes: 0, downvotes: 0, score: 0 };
    const commentCount = commentCountMap.get(i.slug) ?? 0;
    if (voteValue === "upvoted" && voteSummary.score <= 0) return false;
    if (voteValue === "downvoted" && voteSummary.score >= 0) return false;
    if (voteValue === "comments" && commentCount <= 0) return false;
    if (days) {
      const age = (now.getTime() - parseLocal(i.date).getTime()) / 86400000;
      if (age > days) return false;
    }
    if (qq) {
      const hay = [i.title, i.summary, i.affected, i.category].join(" ").toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    if (socialValue === "twitter-mentions" && getPlatformMentions(i, "x") < 20) return false;
    if (socialValue === "reddit-mentions" && getPlatformMentions(i, "reddit") < 20) return false;
    if (socialValue === "github-mentions" && getPlatformMentions(i, "github") < 20) return false;
    return true;
  });

  const counts = {
    critical: filtered.filter((i) => i.severity === "critical").length,
    exploited: filtered.filter((i) => i.exploited).length,
  };
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toLowerCase();
  const parseIsoDay = (date: string) => date.slice(0, 10);

  const sortMode = sortValue === "community" ? "community" : "date";
  const sortedFiltered = [...filtered].sort((a, b) => {
    if (sortMode === "community") {
      const ca = communityMap.get(a.slug) ?? 0;
      const cb = communityMap.get(b.slug) ?? 0;
      if (cb !== ca) return cb - ca;
    }
    const dayCmp = parseIsoDay(b.date).localeCompare(parseIsoDay(a.date));
    if (dayCmp !== 0) return dayCmp;
    return SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
  });

  const xWithSignal = [...filtered].filter((incident) => {
    const heat = incident.xHeatScore ?? 0;
    const mentions = incident.xMentions24h ?? 0;
    return heat > 0 || mentions > 0;
  });
  const xFeed =
    xWithSignal.length > 0
      ? xWithSignal
          .sort((a, b) => {
            const heatDiff = (b.xHeatScore ?? 0) - (a.xHeatScore ?? 0);
            if (heatDiff !== 0) return heatDiff;
            return (b.xMentions24h ?? 0) - (a.xMentions24h ?? 0);
          })
          .slice(0, 12)
      : [...filtered]
          .sort((a, b) => {
            const sev = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
            if (sev !== 0) return sev;
            return parseIsoDay(b.date).localeCompare(parseIsoDay(a.date));
          })
          .slice(0, 12);

  /** Always fill rails when the main feed has rows: rank by estimated activity, then platform %, then recency. */
  const redditFeed =
    filtered.length === 0
      ? []
      : [...filtered]
          .sort((a, b) => {
            const s = redditMentionsSortScore(b) - redditMentionsSortScore(a);
            if (s !== 0) return s;
            const q = (socialQualityRank(b) - socialQualityRank(a));
            if (q !== 0) return q;
            return parseIsoDay(b.date).localeCompare(parseIsoDay(a.date));
          })
          .slice(0, 12);

  const githubFeed =
    filtered.length === 0
      ? []
      : [...filtered]
          .sort((a, b) => {
            const s = githubMentionsSortScore(b) - githubMentionsSortScore(a);
            if (s !== 0) return s;
            const q = socialQualityRank(b) - socialQualityRank(a);
            if (q !== 0) return q;
            return parseIsoDay(b.date).localeCompare(parseIsoDay(a.date));
          })
          .slice(0, 12);

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <DailyBriefHead
            dateStr={dateStr}
            filteredLen={filtered.length}
            allLen={all.length}
            todayCrit={counts.critical}
            actCount={counts.exploited}
          />
        </div>
        <div className="page-head__stats">
          <div className="stat">
            <span className="stat__k">tracked</span>
            <span className="stat__v">{filtered.length}</span>
          </div>
          <div className="stat">
            <span className="stat__k">critical</span>
            <span className="stat__v crit">{counts.critical}</span>
          </div>
          <div className="stat">
            <span className="stat__k">active exploit</span>
            <span className="stat__v orange">{counts.exploited}</span>
          </div>
        </div>
      </div>

      <Suspense fallback={<div className="feed-bar-skeleton" style={{ minHeight: 96 }} aria-hidden />}>
        <FeedBar
          receiptCount={filtered.length}
          receiptTotal={all.length}
          receiptEmphasis={buildFeedReceiptEmphasis(feedQuery)}
          filteredSlugs={sortedFiltered.slice(0, 120).map((i) => i.slug)}
        />
      </Suspense>

      {filtered.length === 0 ? (
        <QuietDayEmpty allLen={all.length} />
      ) : (
        <div className="feed-with-x">
          <div className={`feed--card${layoutMode === "compact" ? " feed--compact" : ""}`}>
                {sortedFiltered.map((i, idx) => (
                  <IncidentItem
                    key={i.slug}
                    incident={{
                      ...i,
                      communityScore: communityMap.get(i.slug) ?? 0,
                    }}
                    practitionerBadge={practitionerMap.get(i.slug) ?? false}
                    index={idx}
                  />
                ))}
              </div>
              <div className="feed-rails">
                <aside className="x-feed-rail" aria-label="X incident feed">
                  <div className="x-feed-rail__head">
                    <div className="x-feed-rail__brand">
                      <Image
                        src="/logos/x.png"
                        alt=""
                        width={20}
                        height={20}
                        className="x-feed-rail__logo"
                      />
                      <h3>X incident feed</h3>
                    </div>
                    <span>live signal</span>
                  </div>
                  <div className="x-feed-rail__list">
                    {xFeed.map((incident) => {
                      const trend = incident.xHeatTrend ?? "flat";
                      const hashtags = (incident.xTopHashtags ?? []).slice(0, 2);
                      return (
                        <Link key={incident.slug} href={`/incident/${incident.slug}`} className="x-feed-rail__item">
                          <div className="x-feed-rail__row">
                            <span className={`x-feed-rail__trend is-${trend}`}>{trend}</span>
                            <span className="x-feed-rail__heat">heat {incident.xHeatScore ?? 0}</span>
                          </div>
                          <p className="x-feed-rail__title">{incident.title}</p>
                          <div className="x-feed-rail__meta">
                            <span>{formatCompactNumber(incident.xMentions24h ?? 0)} mentions</span>
                            <span>{formatCompactNumber(incident.xUniqueAuthors24h ?? 0)} authors</span>
                          </div>
                          {hashtags.length > 0 && (
                            <div className="x-feed-rail__tags">
                              {hashtags.map((tag) => (
                                <span key={`${incident.slug}-${tag}`}>#{tag.replace(/^#/, "")}</span>
                              ))}
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </aside>
                <aside className="reddit-feed-rail" aria-label="Reddit discussion pulse">
                  <div className="reddit-feed-rail__head">
                    <div className="reddit-feed-rail__brand">
                      <Image
                        src="/logos/reddit.png"
                        alt=""
                        width={24}
                        height={24}
                        className="reddit-feed-rail__logo"
                      />
                      <h3>Reddit pulse</h3>
                    </div>
                    <span>measured after refresh</span>
                  </div>
                  <div className="reddit-feed-rail__list">
                    {redditFeed.map((incident) => {
                      const trend = incident.socialTrend ?? "flat";
                      const keywords = (incident.socialKeywords ?? []).slice(0, 2);
                      return (
                        <Link
                          key={`reddit-${incident.slug}`}
                          href={`/incident/${incident.slug}`}
                          className="reddit-feed-rail__item"
                        >
                          <div className="reddit-feed-rail__row">
                            <span className={`reddit-feed-rail__trend is-${trend}`}>{trend}</span>
                            <span className="reddit-feed-rail__share">{redditRailShareLabel(incident)}</span>
                          </div>
                          <p className="reddit-feed-rail__title">{incident.title}</p>
                          <div className="reddit-feed-rail__meta">
                            <span>{redditMentionsLine(incident)}</span>
                            <span>{total24hLine(incident)}</span>
                          </div>
                          {keywords.length > 0 && (
                            <div className="reddit-feed-rail__tags">
                              {keywords.map((kw) => (
                                <span key={`${incident.slug}-r-${kw}`}>{kw}</span>
                              ))}
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </aside>
                <aside className="github-feed-rail" aria-label="GitHub discussion pulse">
                  <div className="github-feed-rail__head">
                    <div className="github-feed-rail__brand">
                      <Image
                        src="/logos/github.png"
                        alt=""
                        width={24}
                        height={24}
                        className="github-feed-rail__logo"
                      />
                      <h3>GitHub pulse</h3>
                    </div>
                    <span>measured after refresh</span>
                  </div>
                  <div className="github-feed-rail__list">
                    {githubFeed.map((incident) => {
                      const trend = incident.socialTrend ?? "flat";
                      const keywords = (incident.socialKeywords ?? []).slice(0, 2);
                      return (
                        <Link
                          key={`github-${incident.slug}`}
                          href={`/incident/${incident.slug}`}
                          className="github-feed-rail__item"
                        >
                          <div className="github-feed-rail__row">
                            <span className={`github-feed-rail__trend is-${trend}`}>{trend}</span>
                            <span className="github-feed-rail__share">{githubRailShareLabel(incident)}</span>
                          </div>
                          <p className="github-feed-rail__title">{incident.title}</p>
                          <div className="github-feed-rail__meta">
                            <span>{githubMentionsLine(incident)}</span>
                            <span>{total24hLine(incident)}</span>
                          </div>
                          {keywords.length > 0 && (
                            <div className="github-feed-rail__tags">
                              {keywords.map((kw) => (
                                <span key={`${incident.slug}-gh-${kw}`}>{kw}</span>
                              ))}
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </aside>
                <aside className="grace-plugins-rail" aria-label="AHackaday updates from GitHub">
                  <div className="grace-plugins-rail__head">
                    <div className="grace-plugins-rail__brand">
                      <Image
                        src={graceAvatarUrl()}
                        alt=""
                        width={24}
                        height={24}
                        className="grace-plugins-rail__logo"
                      />
                      <h3>ahackaday updates</h3>
                    </div>
                    <span>from github</span>
                  </div>
                  <div className="grace-plugins-rail__list">
                    {(gracePluginFeed.length > 0 ? gracePluginFeed : [
                      {
                        id: "fallback-1",
                        title: "Plugin activity will appear here after GitHub sync.",
                        meta: "waiting for feed",
                        href: `https://github.com/${githubUsername}`,
                        tags: ["pending"],
                      },
                    ]).map((item) => (
                      <a
                        key={item.id}
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="grace-plugins-rail__item"
                      >
                        <p className="grace-plugins-rail__title">{item.title}</p>
                        <div className="grace-plugins-rail__meta">
                          <span>{item.meta}</span>
                        </div>
                        {item.tags.length > 0 && (
                          <div className="grace-plugins-rail__tags">
                            {item.tags.slice(0, 2).map((tag) => (
                              <span key={`${item.id}-${tag}`}>{tag}</span>
                            ))}
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                </aside>
              </div>
            </div>
      )}
    </main>
  );
}
