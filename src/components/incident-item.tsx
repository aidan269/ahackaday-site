import Link from "next/link";

import {
  formatIncidentDate,
  getSeverityTone,
  type Incident,
} from "@/lib/incidents";

type IncidentItemProps = {
  incident: Incident;
  index: number;
};

export function IncidentItem({ incident, index }: IncidentItemProps) {
  const delayMs = Math.min(index * 24, 280);

  return (
    <article
      className="feed-item-enter micro-lift group relative mb-1 overflow-hidden rounded-lg border border-zinc-800/90 bg-zinc-900/35 p-2.5 shadow-[0_0_0_1px_rgba(255,255,255,0.015)] hover:border-zinc-700 hover:bg-zinc-900/60 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.2),0_14px_28px_rgba(2,6,23,0.45)]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100">
        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute -left-16 bottom-0 h-24 w-24 rounded-full bg-blue-500/8 blur-2xl" />
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <time className="text-zinc-400">{formatIncidentDate(incident.date)}</time>
        <span
          className={`rounded border px-1.5 py-0.5 uppercase tracking-wide ${getSeverityTone(incident.severity)}`}
        >
          {incident.severity}
        </span>
        <span className="text-zinc-500">{incident.category}</span>
      </div>

      <h2 className="text-sm font-semibold leading-tight text-zinc-100">
        <Link
          href={`/incident/${incident.slug}`}
          className="transition-colors duration-150 hover:text-cyan-300"
        >
          {incident.title}
        </Link>
      </h2>

      <p className="mt-0.5 text-sm leading-snug text-zinc-300">{incident.summary}</p>
      <p className="mt-0.5 text-xs text-zinc-400">
        <span className="text-zinc-500">Affected:</span> {incident.affected}
      </p>

      <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-1.5">
        <span className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
          Full write-up available
        </span>
        <Link
          href={`/incident/${incident.slug}`}
          className="micro-lift glow-focus inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-200 hover:border-cyan-400 hover:bg-cyan-500/20"
        >
          View details
          <span aria-hidden>→</span>
        </Link>
      </div>
    </article>
  );
}
