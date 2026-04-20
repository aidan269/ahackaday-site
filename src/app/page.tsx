import { FeedControls } from "@/components/feed-controls";
import { IncidentItem } from "@/components/incident-item";
import { filterIncidents, getAllIncidents, type Severity } from "@/lib/incidents";

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  value: string | string[] | undefined,
  fallback: string,
): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? fallback;
  return fallback;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const query = readParam(params.q, "");
  const severity = readParam(params.severity, "all");
  const windowValue = readParam(params.window, "30d");

  const incidents = filterIncidents(getAllIncidents(), {
    query,
    severity: severity as Severity | "all",
    window: windowValue as "7d" | "30d" | "90d" | "all",
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
      <div className="mb-3 rounded-xl border border-zinc-800/90 bg-zinc-900/55 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_16px_40px_rgba(2,6,23,0.4)]">
        <div className="flex items-baseline justify-between">
          <h1 className="text-base font-semibold tracking-tight text-zinc-100">
            Incident Feed
          </h1>
          <p className="text-xs text-zinc-500">{incidents.length} matches</p>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Reverse-chronological incidents with cross-org impact. Each entry links to a complete incident brief with mitigation and sources.
        </p>
      </div>

      <FeedControls query={query} severity={severity} windowValue={windowValue} />

      <section className="space-y-1">
        {incidents.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-400">
            No incidents match your filters.
          </p>
        ) : (
          incidents.map((incident, index) => (
            <IncidentItem key={incident.slug} incident={incident} index={index} />
          ))
        )}
      </section>
    </main>
  );
}
