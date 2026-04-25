import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AskAI } from "@/components/ask-ai";
import { IncidentSignoff } from "@/components/incident-signoff";
import { MarkReadOnMount } from "@/components/mark-read-on-mount";
import {
  formatIncidentDate,
  getAllIncidents,
  getIncidentBySlug,
} from "@/lib/incidents";

type IncidentPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const incidents = await getAllIncidents();
  return incidents.map((incident) => ({ slug: incident.slug }));
}

export async function generateMetadata({ params }: IncidentPageProps): Promise<Metadata> {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) return { title: "Incident Not Found" };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ahackaday-site.vercel.app";
  const title = `${incident.title} | AHackaday`;
  const description = incident.summary;
  const url = `/incident/${incident.slug}`;
  const canonical = new URL(url, siteUrl).toString();
  const image = new URL(`/incident/${incident.slug}/opengraph-image`, siteUrl).toString();
  const twitterImage = new URL(`/incident/${incident.slug}/twitter-image`, siteUrl).toString();

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "AHackaday",
      type: "article",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: incident.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [twitterImage],
    },
  };
}

const SEV_COLOR = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
} as const;

export default async function IncidentPage({ params }: IncidentPageProps) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) notFound();

  const sev = SEV_COLOR[incident.severity];
  const trackingId = incident.evidence.cves[0] ?? /CVE-\d{4}-\d+/i.exec(incident.title)?.[0] ?? "n/a";
  const rawContent = incident.content as unknown;
  const contentSections = Array.isArray(rawContent)
    ? rawContent
        .map((sec) => {
          if (!sec || typeof sec !== "object") return null;
          const h = "h" in sec && typeof sec.h === "string" ? sec.h.trim() : "";
          const p = "p" in sec && typeof sec.p === "string" ? sec.p.trim() : "";
          return h && p ? { h, p } : null;
        })
        .filter((sec): sec is { h: string; p: string } => sec !== null)
    : [];

  return (
    <main className="shell">
      <div className="detail-with-ai view-fade">
        <div className={`detail${incident.severity === "critical" ? " is-critical" : ""}`}>
        <MarkReadOnMount slug={incident.slug} />
        <Link href="/" className="back-link">back to feed</Link>

        <div className="detail__head">
          <div className="detail__tags">
            <span>{formatIncidentDate(incident.date)}</span>
            <span
              className={`sev-chip sev-${incident.severity}${incident.severity === "critical" ? " sev-chip--pulse" : ""}`}
              style={{ ["--sev" as string]: sev } as CSSProperties}
            >
              {incident.severity}
            </span>
            <span>{incident.category}</span>
          </div>
          <h1 className="detail__title">{incident.title}</h1>
          <p className="detail__lead">{incident.summary}</p>
        </div>

        <div className="detail__meta">
          <div>
            <span className="k">what&apos;s affected</span>
            <span className="v">{incident.affected}</span>
          </div>
          <div>
            <span className="k">mitigation status</span>
            <span className="v">{incident.mitigationStatus}</span>
          </div>
          <div>
            <span className="k">tracking id</span>
            <span className="v">{trackingId}</span>
          </div>
          <div>
            <span className="k">first reported</span>
            <span className="v">{formatIncidentDate(incident.date)}</span>
          </div>
        </div>

        <div className="detail__body">
          {contentSections.length > 0 ? (
            contentSections.map((sec, idx) => (
              <div key={`${sec.h}-${idx}`}>
                <h3>{sec.h}</h3>
                <p>{sec.p}</p>
              </div>
            ))
          ) : (
            <p>{incident.content}</p>
          )}
        </div>

        <section className="detail__sources">
          <h3>sources</h3>
          <ul>
            {incident.sources.map((sourceUrl) => (
              <li key={sourceUrl}>
                <a href={sourceUrl} target="_blank" rel="noreferrer">{sourceUrl}</a>
              </li>
            ))}
          </ul>
        </section>

        <IncidentSignoff incident={incident} />
        </div>
        <AskAI incident={incident} />
      </div>
    </main>
  );
}
