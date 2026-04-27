import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AskAI } from "@/components/ask-ai";
import { OpenInGrace } from "@/components/open-in-grace";
import {
  formatIncidentDate,
  getAllIncidents,
  getIncidentBySlug,
} from "@/lib/incidents";

export const revalidate = 120;

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
  const trackingId = incident.cve || incident.evidence.cves[0] || null;
  const sections = Array.isArray(incident.content) ? incident.content : [];

  return (
    <main className="shell">
      <div className="detail-with-ai view-fade">
        <article className={`detail ${incident.severity === "critical" ? "is-critical" : ""}`}>
          <div className="detail__bar">
            <Link href="/" className="back-link">back to feed</Link>
            <OpenInGrace incidentSlug={incident.slug} className="detail__grace" />
          </div>

          <div className="detail__head">
            <div className="detail__tags">
              <span style={{ color: "var(--fg-2)" }}>{formatIncidentDate(incident.date)}</span>
              <span className="sev-chip" style={{ ["--sev" as string]: sev } as CSSProperties}>
                {incident.severity}
              </span>
              <span>{incident.category}</span>
              {incident.exploited && <span className="exploited-chip">exploited in the wild</span>}
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
            {trackingId && (
              <div>
                <span className="k">tracking id</span>
                <span className="v" style={{ color: "var(--brand-orange)" }}>{trackingId}</span>
              </div>
            )}
            <div>
              <span className="k">first reported</span>
              <span className="v">{formatIncidentDate(incident.date)}</span>
            </div>
          </div>

          <div className="detail__body">
            {sections.map((sec, idx) => (
              <div key={idx}>
                <h3>{sec.h}</h3>
                <p>{sec.p}</p>
              </div>
            ))}
          </div>

          <div className="detail__sources">
            <h3>sources</h3>
            <ul>
              {incident.sources.map((sourceUrl) => (
                <li key={sourceUrl}>
                  <a href={sourceUrl} target="_blank" rel="noreferrer">{sourceUrl}</a>
                </li>
              ))}
            </ul>
          </div>

          <div className="signoff">
            <em>
              Curated {formatIncidentDate(incident.date)} by the ahackaday team.
              <span className="sep">/</span>
              Sources verified.
              <span className="sep">/</span>
              Brief grounded in {incident.sources.length} source{incident.sources.length === 1 ? "" : "s"}.
            </em>
          </div>
        </article>
        <AskAI incident={incident} />
      </div>
    </main>
  );
}
