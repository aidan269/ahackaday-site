import { DailyBriefHead } from "@/components/daily-brief-head";
import { FeedControls } from "@/components/feed-controls";
import { IncidentItem, IncidentTimelineItem } from "@/components/incident-item";
import { QuietDayEmpty } from "@/components/quiet-day-empty";
import { getAllIncidents, type IncidentType, type Severity } from "@/lib/incidents";
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

function getPlatformMentions(
  incident: Awaited<ReturnType<typeof getAllIncidents>>[number],
  platform: "x" | "reddit" | "github",
): number {
  if (typeof incident.socialMentions24h !== "number") return 0;
  const share = incident.socialPlatformSplit?.[platform];
  if (typeof share !== "number" || share <= 0) return 0;
  return Math.round((incident.socialMentions24h * share) / 100);
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
  const windowValue = readParam(params.window, "30d");
  const layoutParam = readParam(params.layout, "card");
  const layout = (layoutParam === "timeline" ? "timeline" : "card") as "card" | "timeline";
  const severityValue = severity as "all" | Severity;
  const typeFilter = typeValue as "all" | IncidentType;
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
  const xFeed = [...filtered]
    .filter((incident) => {
      const heat = incident.xHeatScore ?? 0;
      const mentions = incident.xMentions24h ?? 0;
      return heat > 0 || mentions > 0;
    })
    .sort((a, b) => {
      const heatDiff = (b.xHeatScore ?? 0) - (a.xHeatScore ?? 0);
      if (heatDiff !== 0) return heatDiff;
      return (b.xMentions24h ?? 0) - (a.xMentions24h ?? 0);
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
              <aside className="x-feed-rail" aria-label="X incident feed">
                <div className="x-feed-rail__head">
                  <h3>X incident feed</h3>
                  <span>live signal</span>
                </div>
                {xFeed.length === 0 ? (
                  <p className="x-feed-rail__empty">No high-confidence X activity yet for this filter window.</p>
                ) : (
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
                )}
              </aside>
            </div>
          )}
        </>
      )}
    </main>
  );
}
