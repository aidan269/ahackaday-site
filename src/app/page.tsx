import { DailyBriefHead } from "@/components/daily-brief-head";
import { FeedControls } from "@/components/feed-controls";
import { IncidentItem, IncidentRow, IncidentTimelineItem } from "@/components/incident-item";
import { QuietDayEmpty } from "@/components/quiet-day-empty";
import Link from "next/link";
import { buildFeedHref } from "@/lib/feed-nav";
import { filterIncidents, getAllIncidents, type IncidentType, type Severity } from "@/lib/incidents";

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
  const layout = readParam(params.layout, "card") as "card" | "row" | "timeline";
  const exploitedRaw = readParam(params.exploited, "");
  const mitigatedRaw = readParam(params.mitigated, "");
  const onlyExploited = exploitedRaw === "1" || exploitedRaw.toLowerCase() === "true";
  const onlyMitigated = mitigatedRaw === "1" || mitigatedRaw.toLowerCase() === "true";

  const all = await getAllIncidents();
  const today = new Date();
  const incidents = filterIncidents(all, {
    query,
    severity: severity as Severity | "all",
    type: typeValue as IncidentType,
    window: windowValue as "7d" | "30d" | "90d" | "all",
    onlyExploited,
    onlyMitigated,
  });

  const critical = incidents.filter((i) => i.severity === "critical").length;
  const exploited = incidents.filter((i) => i.exploited).length;
  const todayCrit = critical;
  const actCount = exploited;
  const dateStr = today.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toLowerCase();
  const scanUtc = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(today);

  const mkHref = (nextSeverity: string, nextType = typeValue) =>
    buildFeedHref({
      q: query,
      severity: nextSeverity,
      type: nextType,
      window: windowValue,
      exploited: onlyExploited,
      mitigated: onlyMitigated,
      layout,
    });

  const groupedByDate = incidents.reduce<Record<string, typeof incidents>>((acc, incident) => {
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
            filteredLen={incidents.length}
            allLen={all.length}
            todayCrit={todayCrit}
            actCount={actCount}
          />
        </div>
        <div className="page-head__stats">
          <div className="stat">
            <span className="stat__k">in view</span>
            <span className="stat__v">{incidents.length}</span>
          </div>
          <div className="stat">
            <span className="stat__k">critical</span>
            <span className="stat__v crit">{critical}</span>
          </div>
          <div className="stat">
            <span className="stat__k">actively exploited</span>
            <span className="stat__v orange">{exploited}</span>
          </div>
        </div>
      </div>

      <FeedControls
        query={query}
        severity={severity}
        typeValue={typeValue}
        windowValue={windowValue}
        layout={layout}
        onlyExploited={onlyExploited}
        onlyMitigated={onlyMitigated}
      />
      <div className="mobile-severity-pills">
        <Link href={mkHref("all")} className={`pill ${severity === "all" ? "is-active" : ""}`}>all</Link>
        <Link href={mkHref("critical")} className={`pill ${severity === "critical" ? "is-active" : ""}`}>critical</Link>
        <Link href={mkHref("high")} className={`pill ${severity === "high" ? "is-active" : ""}`}>high</Link>
        <Link href={mkHref("medium")} className={`pill ${severity === "medium" ? "is-active" : ""}`}>medium</Link>
        <Link href={mkHref("low")} className={`pill ${severity === "low" ? "is-active" : ""}`}>low</Link>
      </div>

      {incidents.length === 0 ? (
        <QuietDayEmpty allLen={all.length} scanUtc={scanUtc} />
      ) : (
        <>
          <div className="feed-meta">
            <span>showing {incidents.length} of {all.length} · sorted by date desc</span>
            <span>layout · {layout}</span>
          </div>
          {layout === "row" ? (
            <div className="feed--row">
              <div className="row-head">
                <span>date</span>
                <span>severity</span>
                <span>type</span>
                <span>title</span>
                <span>affected</span>
                <span />
              </div>
              {incidents.map((i) => <IncidentRow key={i.slug} incident={i} />)}
            </div>
          ) : layout === "timeline" ? (
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
              {incidents.map((i, idx) => <IncidentItem key={i.slug} incident={i} index={idx} />)}
            </div>
          )}
        </>
      )}
    </main>
  );
}
