import Link from "next/link";
import type { CSSProperties } from "react";

import { CalendarDayActions } from "@/components/calendar-day-actions";
import {
  getGraceOrigin,
  getPublicSiteUrl,
  graceAvatarUrl,
  graceDeepLink,
} from "@/lib/ecosystem";
import {
  getAllIncidents,
  type Incident,
  type IncidentType,
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
  unclassified: "var(--sev-unclassified)",
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

function boolParam(v: string | undefined): boolean {
  if (!v) return false;
  const n = v.trim().toLowerCase();
  return n === "1" || n === "true" || n === "yes";
}

function buildCalendarHref(input: {
  month: string;
  day?: string;
  severity?: string;
  type?: string;
  exploited?: boolean;
}): string {
  const p = new URLSearchParams();
  p.set("month", input.month);
  if (input.day) p.set("day", input.day);
  if (input.severity && input.severity !== "all") p.set("severity", input.severity);
  if (input.type && input.type !== "all") p.set("type", input.type);
  if (input.exploited) p.set("exploited", "1");
  const qs = p.toString();
  return qs ? `/calendar?${qs}` : "/calendar";
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const all = await getAllIncidents();
  const now = new Date();

  const monthParam = readParam(params.month) ?? toMonthKey(now);
  const [yearText, monthText] = monthParam.split("-");
  const year = Number.parseInt(yearText ?? String(now.getFullYear()), 10);
  const monthNumber = Number.parseInt(monthText ?? String(now.getMonth() + 1), 10);
  const currentMonth = new Date(year, monthNumber - 1, 1);
  const selectedDay = readParam(params.day);
  const severityFilter = (readParam(params.severity) ?? "all") as "all" | Severity;
  const typeFilter = (readParam(params.type) ?? "all") as "all" | IncidentType;
  const exploitedOnly = boolParam(readParam(params.exploited));

  const incidents = all.filter((incident) => {
    if (severityFilter !== "all" && incident.severity !== severityFilter) return false;
    if (typeFilter !== "all" && incident.category !== typeFilter) return false;
    if (exploitedOnly && !incident.exploited) return false;
    return true;
  });

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
  const graceOrigin = getGraceOrigin();
  const currentCalendarPath = buildCalendarHref({
    month: monthParam,
    day: selectedDay,
    severity: severityFilter,
    type: typeFilter,
    exploited: exploitedOnly,
  });
  const graceCalendarHref = graceOrigin
    ? graceDeepLink(new URL(currentCalendarPath, getPublicSiteUrl()).toString())
    : "";

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
      {graceCalendarHref ? (
        <div className="feed-meta" style={{ marginBottom: 10 }}>
          <span>launch current calendar context in Grace</span>
          <a
            href={graceCalendarHref}
            target="_blank"
            rel="noopener noreferrer"
            className="open-in-grace"
            title="Open in Grace"
            aria-label="Open in Grace"
          >
            <img className="open-in-grace__icon" src={graceAvatarUrl()} alt="" width={22} height={22} decoding="async" />
          </a>
        </div>
      ) : null}

      <form className="cal-filters" method="get">
        <input type="hidden" name="month" value={monthParam} />
        <div className="cal-filter">
          <label htmlFor="cal-severity">severity</label>
          <select id="cal-severity" name="severity" defaultValue={severityFilter}>
            <option value="all">all</option>
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
            <option value="unclassified">unclassified</option>
          </select>
        </div>
        <div className="cal-filter">
          <label htmlFor="cal-type">type</label>
          <select id="cal-type" name="type" defaultValue={typeFilter}>
            <option value="all">all</option>
            <option value="zero-day">zero-day</option>
            <option value="supply-chain">supply-chain</option>
            <option value="breach">breach</option>
            <option value="ransomware">ransomware</option>
            <option value="identity">identity</option>
            <option value="cloud">cloud</option>
            <option value="web">web</option>
            <option value="email">email</option>
            <option value="critical-infrastructure">critical infrastructure</option>
            <option value="exploitation">exploitation</option>
            <option value="consumer-security">consumer security</option>
            <option value="other">other</option>
          </select>
        </div>
        <label className="cal-filter-check">
          <input type="checkbox" name="exploited" value="1" defaultChecked={exploitedOnly} />
          exploited only
        </label>
        <button type="submit" className="cal-filters__apply">apply</button>
      </form>

      <div className="cal-legend" aria-label="Calendar severity legend">
        <span className="cal-legend__item"><i style={{ ["--sev" as string]: "var(--sev-critical)" } as CSSProperties} />critical</span>
        <span className="cal-legend__item"><i style={{ ["--sev" as string]: "var(--sev-high)" } as CSSProperties} />high</span>
        <span className="cal-legend__item"><i style={{ ["--sev" as string]: "var(--sev-medium)" } as CSSProperties} />medium</span>
        <span className="cal-legend__item"><i style={{ ["--sev" as string]: "var(--sev-low)" } as CSSProperties} />low</span>
        <span className="cal-legend__item"><i style={{ ["--sev" as string]: "var(--sev-unclassified)" } as CSSProperties} />unclassified</span>
        <span className="cal-legend__item"><i className="is-exploited" />exploited-in-the-wild</span>
      </div>

      <div className="cal-nav">
        <Link
          href={buildCalendarHref({
            month: toMonthKey(prevMonth),
            severity: severityFilter,
            type: typeFilter,
            exploited: exploitedOnly,
          })}
          className="cal-nav__btn"
        >
          ◀ prev
        </Link>
        <span className="cal-nav__label">
          {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <Link
          href={buildCalendarHref({
            month: toMonthKey(nextMonth),
            severity: severityFilter,
            type: typeFilter,
            exploited: exploitedOnly,
          })}
          className="cal-nav__btn"
        >
          next ▶
        </Link>
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
                href={buildCalendarHref({
                  month: toMonthKey(currentMonth),
                  day: key,
                  severity: severityFilter,
                  type: typeFilter,
                  exploited: exploitedOnly,
                })}
                className={cls}
              >
                <span className="cal-day__num">{day.getDate()}</span>
                {dayIncidents.length > 0 && (
                  <>
                    <div className="cal-marks">
                      {dayIncidents.slice(0, 4).map((i, j) => (
                        <span key={j} className="cal-mark" style={{ ["--sev" as string]: SEV_COLOR[i.severity] } as CSSProperties} />
                      ))}
                      {dayIncidents.length > 4 && (
                        <span className="cal-mark cal-mark--more">+{dayIncidents.length - 4}</span>
                      )}
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
          {selectedDay && selectedIncidents.length > 0 && (
            <CalendarDayActions
              dateLabel={parseLocal(selectedDay).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              incidents={selectedIncidents.map((i) => ({ slug: i.slug, title: i.title, severity: i.severity }))}
            />
          )}

          {!selectedDay ? (
            <p style={{ color: "var(--fg-muted)", fontSize: 12 }}>
              Click a day in the grid to inspect incidents and jump to full reports.
            </p>
          ) : selectedIncidents.length === 0 ? (
            <p style={{ color: "var(--fg-muted)", fontSize: 12 }}>no tracked incidents for this date.</p>
          ) : (
            selectedIncidents.map((i) => (
              <Link key={i.slug} href={`/incident/${i.slug}`} className="cal-side__item">
                <span className="sev-chip" style={{ ["--sev" as string]: SEV_COLOR[i.severity] } as CSSProperties}>
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
