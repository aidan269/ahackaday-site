import { FeedControls } from "@/components/feed-controls";
import Link from "next/link";
import {
  IncidentItem,
} from "@/components/incident-item";
import {
  filterIncidents,
  getAllIncidents,
  type IncidentType,
  type Severity,
} from "@/lib/incidents";

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

  const all = await getAllIncidents();
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;
  const incidents = filterIncidents(all, {
    query,
    severity: severity as Severity | "all",
    type: typeValue as IncidentType,
    window: windowValue as "7d" | "30d" | "90d" | "all",
  });

  const critical = incidents.filter((i) => i.severity === "critical").length;
  const exploited = incidents.filter((i) => i.category === "exploitation").length;
  const todayTop = all
    .filter((i) => i.date.slice(0, 10) === todayIso)
    .filter((i) => i.severity === "critical" || i.severity === "high")
    .slice(0, 3);
  const monthShort = today.toLocaleDateString("en-US", { month: "short" }).toLowerCase();

  const mkHref = (nextSeverity: string, nextType = typeValue) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (nextSeverity && nextSeverity !== "all") next.set("severity", nextSeverity);
    if (nextType !== "all") next.set("type", nextType);
    if (windowValue !== "30d") next.set("window", windowValue);
    next.set("layout", "card");
    const qs = next.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <div className="mobile-kicker">
            <span className="live-dot" />
            <span>live</span>
            <span className="mobile-kicker-sep">updated {monthShort} {today.getDate()}</span>
          </div>
          <h1 className="page-title">
            This week <span className="dim">in</span> <span className="accent">security</span>
            <span className="accent">.</span>
          </h1>
          <p className="page-sub">
            Clear, human-first incident intelligence so teams can respond with confidence.
          </p>
        </div>
        <div className="page-head__stats">
          <div className="stat">
            <span className="stat__k">total</span>
            <span className="stat__v">{incidents.length}</span>
          </div>
          <div className="stat">
            <span className="stat__k">critical</span>
            <span className="stat__v crit">{critical}</span>
          </div>
          <div className="stat">
            <span className="stat__k">exploited</span>
            <span className="stat__v orange">{exploited}</span>
          </div>
        </div>
      </div>

      <FeedControls
        query={query}
        severity={severity}
        typeValue={typeValue}
        windowValue={windowValue}
      />
      <section className="daily-digest">
        <h2>today&apos;s 3 things</h2>
        {todayTop.length === 0 ? (
          <p>quiet queue right now. no critical or high incidents at the moment.</p>
        ) : (
          <ul>
            {todayTop.map((incident) => (
              <li key={incident.slug}>
                <Link href={`/incident/${incident.slug}`}>
                  <span className={`digest-sev digest-sev--${incident.severity}`}>{incident.severity}</span>
                  <span>{incident.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="mobile-severity-pills">
        <Link href={mkHref("all")} className={`pill ${severity === "all" ? "is-active" : ""}`}>all</Link>
        <Link href={mkHref("critical")} className={`pill ${severity === "critical" ? "is-active" : ""}`}>critical</Link>
        <Link href={mkHref("high")} className={`pill ${severity === "high" ? "is-active" : ""}`}>high</Link>
        <Link href={mkHref("medium")} className={`pill ${severity === "medium" ? "is-active" : ""}`}>medium</Link>
        <Link href={mkHref("all", "exploitation")} className={`pill ${typeValue === "exploitation" ? "is-active" : ""}`}>exploited</Link>
      </div>

      <div className="feed-meta">
        <span>
          showing <span className="strong">{incidents.length}</span> of {all.length} highest-signal incidents first
        </span>
      </div>

      {incidents.length === 0 ? (
        <div className="empty">no incidents match the active filters.</div>
      ) : (
        <div className="feed--card">
          {incidents.map((i, idx) => <IncidentItem key={i.slug} incident={i} index={idx} />)}
        </div>
      )}
    </main>
  );
}
