import { DailyBriefHead } from "@/components/daily-brief-head";
import { FeedControls } from "@/components/feed-controls";
import { IncidentItem, IncidentTimelineItem } from "@/components/incident-item";
import { QuietDayEmpty } from "@/components/quiet-day-empty";
import { getAllIncidents, type IncidentType, type Severity } from "@/lib/incidents";

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

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const query = readParam(params.q, "");
  const severity = readParam(params.severity, "all");
  const typeValue = readParam(params.type, "all");
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
        windowValue={win}
        layout={layout}
      />

      <div className="feed-meta">
        <span>
          showing <span style={{ color: "var(--fg)" }}>{filtered.length}</span> of {all.length}
          <span className="dot">·</span>sorted by date desc
        </span>
        <span>
          layout : <span style={{ color: "var(--brand-orange)" }}>{layout}</span>
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
            <div className="feed--card">
              {filtered.map((i, idx) => <IncidentItem key={i.slug} incident={i} index={idx} />)}
            </div>
          )}
        </>
      )}
    </main>
  );
}
