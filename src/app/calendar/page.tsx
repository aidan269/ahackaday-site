import Link from "next/link";

import {
  formatIncidentDate,
  getAllIncidents,
  getSeverityTone,
  type Incident,
} from "@/lib/incidents";

type CalendarPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function readParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function buildGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const incidents = await getAllIncidents();
  const now = new Date();

  const monthParam = readParam(params.month) ?? toMonthKey(now);
  const [yearText, monthText] = monthParam.split("-");
  const year = Number.parseInt(yearText ?? String(now.getFullYear()), 10);
  const monthNumber = Number.parseInt(monthText ?? String(now.getMonth() + 1), 10);
  const currentMonth = new Date(year, monthNumber - 1, 1);

  const selectedDay = readParam(params.day);
  const grid = buildGrid(currentMonth);

  const byDay = new Map<string, Incident[]>();
  for (const incident of incidents) {
    const key = incident.date.slice(0, 10);
    const existing = byDay.get(key);
    if (existing) {
      existing.push(incident);
    } else {
      byDay.set(key, [incident]);
    }
  }

  const selectedIncidents = selectedDay ? byDay.get(selectedDay) ?? [] : [];
  const prevMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
      <div className="mb-3 border-b border-zinc-800 pb-2">
        <h1 className="text-base font-semibold text-zinc-100">Incident Calendar</h1>
        <p className="text-xs text-zinc-400">Find incident clusters by date.</p>
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
        <Link href={`/calendar?month=${toMonthKey(prevMonth)}`} className="hover:text-zinc-100">
          ← Prev
        </Link>
        <span className="text-zinc-200">
          {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <Link href={`/calendar?month=${toMonthKey(nextMonth)}`} className="hover:text-zinc-100">
          Next →
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <section>
          <div className="grid grid-cols-7 border border-zinc-800 text-xs">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
              <div key={label} className="border-b border-zinc-800 p-2 text-zinc-500">
                {label}
              </div>
            ))}
            {grid.map((day) => {
              const key = dayKey(day);
              const dayIncidents = byDay.get(key) ?? [];
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
              return (
                <Link
                  key={key}
                  href={`/calendar?month=${toMonthKey(currentMonth)}&day=${key}`}
                  className="min-h-18 border-b border-r border-zinc-800 p-1.5 hover:bg-zinc-900/70"
                >
                  <div className={isCurrentMonth ? "text-zinc-200" : "text-zinc-600"}>
                    {day.getDate()}
                  </div>
                  {dayIncidents.length > 0 ? (
                    <p className="mt-1 text-[11px] text-cyan-300">{dayIncidents.length} incident(s)</p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>

        <aside className="border border-zinc-800 bg-zinc-900/30 p-2.5">
          <h2 className="mb-1.5 text-sm font-semibold text-zinc-100">
            {selectedDay ? `On ${selectedDay}` : "Pick a day"}
          </h2>
          {selectedDay && selectedIncidents.length === 0 ? (
            <p className="text-xs text-zinc-500">No tracked incidents for this date.</p>
          ) : null}
          {!selectedDay ? (
            <p className="text-xs text-zinc-500">
              Click a day in the grid to inspect incidents and jump to full reports.
            </p>
          ) : null}
          <div className="space-y-2">
            {selectedIncidents.map((incident) => (
              <article key={incident.slug} className="border-t border-zinc-800 pt-2">
                <div className="mb-1 text-xs text-zinc-500">
                  {formatIncidentDate(incident.date)}
                </div>
                <Link href={`/incident/${incident.slug}`} className="text-sm text-zinc-100 hover:text-cyan-300">
                  {incident.title}
                </Link>
                <p className="mt-1 text-xs text-zinc-400">{incident.summary}</p>
                <span className={`mt-1 inline-block border px-1.5 py-0.5 text-[10px] uppercase ${getSeverityTone(incident.severity)}`}>
                  {incident.severity}
                </span>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
