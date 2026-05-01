import { DailyBriefHead } from "@/components/daily-brief-head";
import { FeedControls } from "@/components/feed-controls";
import { IncidentItem, IncidentTimelineItem } from "@/components/incident-item";
import { QuietDayEmpty } from "@/components/quiet-day-empty";
import { matchesFocusLens, type FocusLens } from "@/lib/focus-lenses";
import { getAllIncidents, type IncidentType, type Severity } from "@/lib/incidents";
import type { SocialDataQuality } from "@/lib/incident-types";
import Image from "next/image";
import Link from "next/link";

/** Refresh feed periodically (Supabase / markdown) so fixes and new rows surface without only redeploying. */
export const revalidate = 120;

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(v: string | string[] | undefined, fallback: string): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0) return v[0] ?? fallback;
  return fallback;
}

type IncidentRow = Awaited<ReturnType<typeof getAllIncidents>>[number];

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

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const query = readParam(params.q, "");
  const severity = readParam(params.severity, "all");
  const typeValue = readParam(params.type, "all");
  const socialValue = readParam(params.social, "all");
  const focusValue = readParam(params.focus, "all");
  const windowValue = readParam(params.window, "30d");
  const layoutParam = readParam(params.layout, "card");
  const layout = (layoutParam === "timeline" ? "timeline" : "card") as "card" | "timeline";
  const severityValue = severity as "all" | Severity;
  const typeFilter = typeValue as "all" | IncidentType;
  const focusFilter = (focusValue === "ai" || focusValue === "government" ? focusValue : "all") as FocusLens;
  const win = (windowValue === "7d" ? "7" : windowValue) as "7" | "30d" | "90d" | "all";

  const all = await getAllIncidents();
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
    if (!matchesFocusLens(i, focusFilter)) return false;
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

  const groupedByDate = filtered.reduce<Record<string, typeof filtered>>((acc, incident) => {
    const key = incident.date.slice(0, 10);
    if (!acc[key]) acc[key] = [];
    acc[key].push(incident);
    return acc;
  }, {});
  const parseIsoDay = (date: string) => date.slice(0, 10);

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

      <FeedControls
        query={query}
        severity={severity}
        typeValue={typeValue}
        socialValue={socialValue}
        windowValue={win}
        layout={layout}
      />

      <div className="feed-meta">
        <span>
          showing <span style={{ color: "var(--fg)" }}>{filtered.length}</span> of {all.length}
          <span className="dot">·</span>sorted by date desc
        </span>
      </div>

      {filtered.length === 0 ? (
        <QuietDayEmpty allLen={all.length} />
      ) : (
        <>
          {layout === "timeline" ? (
            <div className="feed--timeline">
              {Object.entries(groupedByDate).map(([date, items]) => (
                <div key={date} className="tl-group">
                  <h3 className="tl-group__date">{new Date(date).toLocaleDateString("en-US", { month: "short", day: "2-digit" })}</h3>
                  {items.map((i) => <IncidentTimelineItem key={i.slug} incident={i} />)}
                </div>
              ))}
            </div>
          ) : (
            <div className="feed-with-x">
              <div className="feed--card">
                {filtered.map((i, idx) => <IncidentItem key={i.slug} incident={i} index={idx} />)}
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
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
