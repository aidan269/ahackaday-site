import { FeedControls } from "@/components/feed-controls";
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
  const incidents = filterIncidents(all, {
    query,
    severity: severity as Severity | "all",
    type: typeValue as IncidentType,
    window: windowValue as "7d" | "30d" | "90d" | "all",
  });

  const critical = incidents.filter((i) => i.severity === "critical").length;

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            What&apos;s breaking <span className="dim">this week</span>
            <span className="accent">.</span>
          </h1>
          <p className="page-sub">
            Major cybersecurity incidents with broad implications.
          </p>
        </div>
        <div className="page-head__stats">
          <div className="stat">
            <span className="stat__k">tracked</span>
            <span className="stat__v">{incidents.length}</span>
          </div>
          <div className="stat">
            <span className="stat__k">critical</span>
            <span className="stat__v crit">{critical}</span>
          </div>
          <div className="stat">
            <span className="stat__k">total</span>
            <span className="stat__v orange">{all.length}</span>
          </div>
        </div>
      </div>

      <FeedControls
        query={query}
        severity={severity}
        typeValue={typeValue}
        windowValue={windowValue}
      />

      <div className="feed-meta">
        <span>
          showing <span className="strong">{incidents.length}</span> of {all.length} sorted by date desc
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
