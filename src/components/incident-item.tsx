import Link from "next/link";
import {
  formatIncidentDate,
  type Incident,
  type Severity,
} from "@/lib/incidents";

const SEV_COLOR: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
};

function fmtShort(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function rel(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  const days = Math.round((now.getTime() - then.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

type Props = { incident: Incident; index?: number };

export function IncidentItem({ incident }: Props) {
  const sev = SEV_COLOR[incident.severity];
  const style = { ["--sev" as string]: sev } as React.CSSProperties;

  return (
    <Link href={`/incident/${incident.slug}`} className="card" style={style}>
      <div className="card__date">
        {fmtShort(incident.date)}
        <span className="rel">{rel(incident.date)}</span>
      </div>
      <div className="card__main">
        <div className="card__tagline">
          <span className={`sev-chip sev-${incident.severity}`} style={style}>{incident.severity}</span>
          <span className="cat-chip">{incident.category}</span>
        </div>
        <h2 className="card__title">{incident.title}</h2>
        <p className="card__sum">{incident.summary}</p>
        <div className="card__affected">
          <span className="k">affected</span>
          <span>{incident.affected}</span>
        </div>
      </div>
      <div className="card__arrow">→</div>
    </Link>
  );
}

/* Row variant */
export function IncidentRow({ incident }: Props) {
  const sev = SEV_COLOR[incident.severity];
  const style = { ["--sev" as string]: sev } as React.CSSProperties;

  return (
    <Link href={`/incident/${incident.slug}`} className="row" style={style}>
      <div className="row__date">{fmtShort(incident.date)}</div>
      <div className={`row__sev sev-${incident.severity}`}>{incident.severity}</div>
      <div className="row__cat">{incident.category}</div>
      <div className="row__title">{incident.title}</div>
      <div className="row__affected">{incident.affected}</div>
      <div className="row__arrow">›</div>
    </Link>
  );
}

/* Timeline variant */
export function IncidentTimelineItem({ incident }: Props) {
  const sev = SEV_COLOR[incident.severity];
  const style = { ["--sev" as string]: sev } as React.CSSProperties;

  return (
    <Link href={`/incident/${incident.slug}`} className="tl-item" style={style}>
      <div className="tl-item__head">
        <span>{formatIncidentDate(incident.date)}</span>
        <span style={{ color: sev }}>■ {incident.severity}</span>
        <span>{incident.category}</span>
      </div>
      <h3 className="tl-item__title">{incident.title}</h3>
      <p className="tl-item__sum">{incident.summary}</p>
    </Link>
  );
}
