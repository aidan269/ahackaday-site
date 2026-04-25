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
            <span className="k">category</span>
            <span className="v">{incident.category}</span>
          </div>
          <div>
            <span className="k">first reported</span>
            <span className="v">{formatIncidentDate(incident.date)}</span>
          </div>
        </div>

        <section className="detail__brief-section">
          <h3>tldr</h3>
          <p>{incident.tldr}</p>
        </section>

        <section className="detail__brief-section">
          <h3>real-world impact</h3>
          <p>{incident.realWorldImpact}</p>
        </section>

        <section className="detail__brief-section">
          <h3>why you should care</h3>
          <p>{incident.whyCare}</p>
        </section>

        <section className="detail__sources">
          <h3>action items</h3>
          <ul className="detail__list">
            {incident.actionItems.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </section>

        <section className="detail__sources">
          <h3>iocs</h3>
          {incident.iocs.length === 0 ? (
            <p style={{ margin: 0, color: "var(--fg-3)" }}>none reported in source.</p>
          ) : (
            <ul className="detail__list">
              {incident.iocs.map((ioc) => (
                <li key={ioc}>{ioc}</li>
              ))}
            </ul>
          )}
        </section>

        {incident.ambiguities.length > 0 && (
          <section className="detail__sources">
            <h3>ambiguities</h3>
            <ul className="detail__list">
              {incident.ambiguities.map((ambiguity) => (
                <li key={ambiguity}>{ambiguity}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="detail__sources">
          <h3>read more</h3>
          <ul>
            {incident.sources.map((sourceUrl) => (
              <li key={sourceUrl}>
                <a href={sourceUrl} target="_blank" rel="noreferrer">full incident brief and source</a>
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
