"use client";

type DayIncident = {
  slug: string;
  title: string;
  severity: string;
};

type CalendarDayActionsProps = {
  dateLabel: string;
  incidents: DayIncident[];
};

export function CalendarDayActions({ dateLabel, incidents }: CalendarDayActionsProps) {
  if (incidents.length === 0) return null;

  function openAll() {
    for (const incident of incidents) {
      window.open(`/incident/${incident.slug}`, "_blank", "noopener,noreferrer");
    }
  }

  async function copySummary() {
    const lines = [
      `${dateLabel} · ${incidents.length} incident${incidents.length === 1 ? "" : "s"}`,
      ...incidents.map((incident, idx) => `${idx + 1}. [${incident.severity}] ${incident.title}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
    } catch {
      // no-op: clipboard API unavailable in some browsers/contexts
    }
  }

  return (
    <div className="cal-side__actions">
      <button type="button" className="cal-side__action-btn" onClick={openAll}>
        open all ({incidents.length})
      </button>
      <button type="button" className="cal-side__action-btn" onClick={copySummary}>
        copy day summary
      </button>
    </div>
  );
}
