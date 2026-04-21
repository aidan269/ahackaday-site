import { FeedControls } from "@/components/feed-controls";
import {
  IncidentItem,
  IncidentRow,
  IncidentTimelineItem,
} from "@/components/incident-item";
import {
  filterIncidents,
  getAllIncidents,
  type Incident,
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

function groupByMonth(list: Incident[]) {
  const m = new Map<string, Incident[]>();
  for (const i of list) {
    const k = i.date.slice(0, 7);
    const arr = m.get(k) ?? [];
    arr.push(i);
    m.set(k, arr);
  }
  return Array.from(m.entries());
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const query = readParam(params.q, "");
  const severity = readParam(params.severity, "all");
  const typeValue = readParam(params.type, "all");
  const windowValue = readParam(params.window, "30d");
  const layout = readParam(params.layout, "card");

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
          <div className="eyebrow">
            incident feed <span className="slash">/</span> cross-org impact{" "}
            <span className="slash">/</span> reverse chronological
          </div>
          <h1 className="page-title">
            What&apos;s breaking <span className="dim">this week</span>
            <span className="accent">.</span>
          </h1>
          <p className="page-sub">
            Major cybersecurity incidents with broad implications. Every entry links a full brief with mitigation and sources.
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
        layout={layout}
      />

      <div className="feed-meta">
        <span>
          showing <span className="strong">{incidents.length}</span> of {all.length}
          <span className="dot">·</span> sorted by date desc
        </span>
        <span>
          layout : <span style={{ color: "var(--brand-orange)" }}>{layout}</span>
        </span>
      </div>

      {incidents.length === 0 ? (
        <div className="empty">no incidents match the active filters.</div>
      ) : layout === "row" ? (
        <div className="feed--row">
          <div className="row-head">
            <div>date</div>
            <div>severity</div>
            <div>type</div>
            <div>incident</div>
            <div>affected</div>
            <div></div>
          </div>
          {incidents.map((i) => <IncidentRow key={i.slug} incident={i} />)}
        </div>
      ) : layout === "timeline" ? (
        <div className="feed--timeline">
          {groupByMonth(incidents).map(([k, list]) => {
            const [y, m] = k.split("-").map(Number);
            const label = new Date(y, m - 1, 1)
              .toLocaleDateString("en-US", { month: "long", year: "numeric" })
              .toLowerCase();
            return (
              <div key={k} className="tl-group">
                <div className="tl-group__date">
                  {label}{" "}
                  <span className="muted">— {list.length} incident{list.length === 1 ? "" : "s"}</span>
                </div>
                {list.map((i) => <IncidentTimelineItem key={i.slug} incident={i} />)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="feed--card">
          {incidents.map((i, idx) => <IncidentItem key={i.slug} incident={i} index={idx} />)}
        </div>
      )}
    </main>
  );
}
