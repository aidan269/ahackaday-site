import Link from "next/link";

import {
  getAllIncidents,
  type Incident,
  type Severity,
} from "@/lib/incidents";

type CalendarPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SEV_COLOR: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
};

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function readParam(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}
function dayKeyLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function parseLocal(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
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

  const first = new Date(year, monthNumber - 1, 1);
  const grid = Array.from({ length: 42 }, (_, idx) => {
    const d = new Date(first);
    d.setDate(1 - first.getDay() + idx);
    return d;
  });

  const byDay = new Map<string, Incident[]>();
  for (const i of incidents) {
    const k = i.date.slice(0, 10);
    const arr = byDay.get(k) ?? [];
    arr.push(i);
    byDay.set(k, arr);
  }

  const selectedIncidents = selectedDay ? byDay.get(selectedDay) ?? [] : [];
  const prevMonth = new Date(year, monthNumber - 2, 1);
  const nextMonth = new Date(year, monthNumber, 1);
  const markedDays = Array.from(byDay.keys()).filter((k) => k.startsWith(monthParam)).length;
  const todayKey = dayKeyLocal(now);

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <div className="eyebrow">incident calendar <span className="slash">/</span> pattern detection</div>
          <h1 className="page-title">
            Find clusters <span className="dim">by date</span><span className="accent">.</span>
          </h1>
          <p className="page-sub">
            Click a day to inspect tracked incidents and jump into full reports. Heat marks show severity at a glance.
          </p>
        </div>
        <div className="page-head__stats">
          <div className="stat">
            <span className="stat__k">month</span>
            <span className="stat__v">{currentMonth.toLocaleDateString("en-US", { month: "short" }).toLowerCase()}</span>
          </div>
          <div className="stat">
            <span className="stat__k">year</span>
            <span className="stat__v">{year}</span>
          </div>
          <div className="stat">
            <span className="stat__k">marked days</span>
            <span className="stat__v orange">{markedDays}</span>
          </div>
        </div>
      </div>

      <div className="cal-nav">
        <Link href={`/calendar?month=${toMonthKey(prevMonth)}`} className="cal-nav__btn">◀ prev</Link>
        <span className="cal-nav__label">
          {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <Link href={`/calendar?month=${toMonthKey(nextMonth)}`} className="cal-nav__btn">next ▶</Link>
      </div>

      <div className="cal-wrap">
        <section className="cal-grid">
          {["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((label) => (
            <div key={label} className="cal-dow">{label}</div>
          ))}
          {grid.map((day) => {
            const key = dayKeyLocal(day);
            const dayIncidents = byDay.get(key) ?? [];
            const isDim = day.getMonth() !== monthNumber - 1;
            const isToday = key === todayKey;
            const isSel = key === selectedDay;
            const cls = [
              "cal-day",
              isDim ? "is-dim" : "",
              isToday ? "is-today" : "",
              isSel ? "is-selected" : "",
            ].filter(Boolean).join(" ");

            return (
              <Link
                key={key}
                href={`/calendar?month=${toMonthKey(currentMonth)}&day=${key}`}
                className={cls}
              >
                <span className="cal-day__num">{day.getDate()}</span>
                {dayIncidents.length > 0 && (
                  <>
                    <div className="cal-marks">
                      {dayIncidents.slice(0, 5).map((i, j) => (
                        <span key={j} className="cal-mark" style={{ ["--sev" as string]: SEV_COLOR[i.severity] } as React.CSSProperties} />
                      ))}
                    </div>
                    <span className="cal-count">
                      {dayIncidents.length} incident{dayIncidents.length === 1 ? "" : "s"}
                    </span>
                  </>
                )}
              </Link>
            );
          })}
        </section>

        <aside className="cal-side">
          <h3>selected</h3>
          <div className="cal-side__date">
            {selectedDay
              ? parseLocal(selectedDay).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
              : "pick a day"}
          </div>

          {!selectedDay ? (
            <p style={{ color: "var(--fg-muted)", fontSize: 12 }}>
              Click a day in the grid to inspect incidents and jump to full reports.
            </p>
          ) : selectedIncidents.length === 0 ? (
            <p style={{ color: "var(--fg-muted)", fontSize: 12 }}>no tracked incidents for this date.</p>
          ) : (
            selectedIncidents.map((i) => (
              <Link key={i.slug} href={`/incident/${i.slug}`} className="cal-side__item">
                <span className="sev-chip" style={{ ["--sev" as string]: SEV_COLOR[i.severity] } as React.CSSProperties}>
                  {i.severity}
                </span>
                <div className="t">{i.title}</div>
                <div className="s">{i.summary}</div>
              </Link>
            ))
          )}
        </aside>
      </div>
    </main>
  );
}
