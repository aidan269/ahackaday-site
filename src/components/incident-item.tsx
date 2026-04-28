"use client";

import Link from "next/link";
import { useCallback, useState, type CSSProperties, type MouseEvent } from "react";

import { useEmotionalPreferences } from "@/components/emotional-preferences-provider";
import { OpenInGrace } from "@/components/open-in-grace";
import { formatIncidentDate } from "@/lib/format-incident-date";
import type { Incident, Severity } from "@/lib/incident-types";
import { truncateForDisplay } from "@/lib/truncate-display";

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
  const { toggleSaved, isSaved, isRead } = useEmotionalPreferences();
  const sev = SEV_COLOR[incident.severity];
  const style = { ["--sev" as string]: sev } as CSSProperties;
  const isExploited = /(actively )?exploited( in the wild)?|under active exploitation|zero-day attacks/i.test(
    `${incident.title} ${incident.summary} ${incident.content}`,
  );
  const cve = incident.evidence.cves[0] ?? /CVE-\d{4}-\d+/i.exec(incident.title)?.[0];
  const socialMentions = typeof incident.socialMentions24h === "number" ? incident.socialMentions24h : null;
  const socialTrend = incident.socialTrend ?? null;
  const socialDelta = typeof incident.socialDelta24hPct === "number" ? incident.socialDelta24hPct : null;
  const socialPreviewParts = [
    socialMentions !== null ? `${socialMentions}` : null,
    socialTrend,
    socialDelta !== null ? `Δ ${socialDelta >= 0 ? "+" : ""}${socialDelta}%` : null,
  ].filter((part): part is string => Boolean(part));

  const saved = isSaved(incident.slug);
  const read = isRead(incident.slug);
  const [bloomKey, setBloomKey] = useState(0);

  const onStar = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!saved) setBloomKey((k) => k + 1);
      toggleSaved(incident.slug);
    },
    [incident.slug, saved, toggleSaved],
  );

  return (
    <div
      className={`card card--${incident.severity}${read ? " is-read" : ""}`}
      style={style}
    >
      <Link href={`/incident/${incident.slug}`} className="card__link" prefetch style={{ display: "contents" }}>
        <div className="card__date">
          {fmtShort(incident.date)}
          <span className="rel">{rel(incident.date)}</span>
        </div>
        <div className="card__main">
          <div className="card__tagline">
            <span className={`sev-chip sev-${incident.severity}`} style={style}>{incident.severity}</span>
            <span className="cat-chip">{incident.category}</span>
            {isExploited && <span className="card__flag">exploited in the wild</span>}
            {read && <span className="read-check">✓ read</span>}
          </div>
          <h2 className="card__title">{incident.title}</h2>
          <p className="card__sum">{incident.summary}</p>
          <div className="card__line">
            <span className="k">affected</span>
            <span className="card__line-v">{truncateForDisplay(incident.affected, 140)}</span>
            {cve && <span className="card__cve">{cve}</span>}
          </div>
          {socialPreviewParts.length > 0 && (
            <div className="card__social-preview">
              <span className="k">social</span>
              <span className="v">{socialPreviewParts.join(" · ")}</span>
            </div>
          )}
        </div>
        <div className="card__arrow">→</div>
      </Link>
      <OpenInGrace incidentSlug={incident.slug} className="card__grace" />
      <button
        type="button"
        className={`card__star${saved ? " is-on" : ""}`}
        onClick={onStar}
        aria-label={saved ? "unsave" : "save"}
      >
        {saved && <span className="card__star-bloom" key={bloomKey} />}
        <svg width="13" height="13" viewBox="0 0 14 14" fill={saved ? "currentColor" : "none"} aria-hidden>
          <path
            d="M7 1.7l1.6 3.4 3.7.5-2.7 2.6.7 3.7L7 10l-3.3 1.9.7-3.7L1.7 5.6l3.7-.5z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

/* Row variant */
export function IncidentRow({ incident }: Props) {
  const sev = SEV_COLOR[incident.severity];
  const style = { ["--sev" as string]: sev } as CSSProperties;

  return (
    <Link href={`/incident/${incident.slug}`} className="row" style={style}>
      <div className="row__date">{fmtShort(incident.date)}</div>
      <div className={`row__sev sev-${incident.severity}`}>{incident.severity}</div>
      <div className="row__cat">{incident.category}</div>
      <div className="row__title">{incident.title}</div>
      <div className="row__affected">{truncateForDisplay(incident.affected, 160)}</div>
      <div className="row__arrow">›</div>
    </Link>
  );
}

/* Timeline variant */
export function IncidentTimelineItem({ incident }: Props) {
  const sev = SEV_COLOR[incident.severity];
  const style = { ["--sev" as string]: sev } as CSSProperties;

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
