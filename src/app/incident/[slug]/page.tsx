import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

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

function implicationsForSeverity(severity: keyof typeof SEV_COLOR, affected: string): string {
  if (severity === "critical") {
    return `Why you should care: this can become a real outage or breach fast for ${affected}. If this touches your stack, treat it as urgent today, not a “later this week” task, because teams that move first here usually avoid the public postmortem later.`;
  }
  if (severity === "high") {
    return `Why you should care: this is the kind of issue that quietly turns into customer pain, security incidents, or fire-drills for ${affected} if nobody owns it this week, and it often sits in that “not urgent until it suddenly is” class of risk.`;
  }
  if (severity === "medium") {
    return `Why you should care: this is not panic-level, but it still raises risk for ${affected}. If it combines with another weak spot, impact can jump quickly, and medium findings are often the building blocks behind bigger incidents.`;
  }
  return `Why you should care: low severity does not mean no severity. For ${affected}, this is mostly a hygiene issue now, but ignoring these is how future incidents get easier, and boring fixes are usually what keep headline incidents from happening later.`;
}

export default async function IncidentPage({ params }: IncidentPageProps) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) notFound();

  const sev = SEV_COLOR[incident.severity];

  return (
    <main className="shell">
      <div className="detail">
        <Link href="/" className="back-link">back to feed</Link>

        <div className="detail__head">
          <div className="detail__tags">
            <span>{formatIncidentDate(incident.date)}</span>
            <span
              className={`sev-chip sev-${incident.severity}`}
              style={{ ["--sev" as string]: sev } as React.CSSProperties}
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

        <section className="detail__remediation">
          <h3>real-world impact</h3>
          <div className="detail__remediation-box">
            <p>
              {implicationsForSeverity(incident.severity, incident.affected)}
            </p>
          </div>
        </section>

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
      </div>
    </main>
  );
}
