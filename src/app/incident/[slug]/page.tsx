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
  return {
    title: `${incident.title} | AHackaday`,
    description: incident.summary,
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
            <span className="k">mitigation status</span>
            <span className="v">{incident.mitigationStatus}</span>
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
          <h3>remediation</h3>
          <div className="detail__remediation-box">
            <p className="lead">
              Current status: <strong>{incident.mitigationStatus}</strong>
            </p>
            <p>
              Prioritize containment and patching for affected systems ({incident.affected}), then verify controls
              and monitor source guidance for additional mitigation updates.
            </p>
          </div>
        </section>

        <section className="detail__sources">
          <h3>dig in links</h3>
          <ul>
            {incident.sources.map((sourceUrl) => (
              <li key={sourceUrl}>
                <a href={sourceUrl} target="_blank" rel="noreferrer">
                  <span className="src-link__title">full incident brief and source</span>
                  <span className="src-link__meta">
                    affected: {incident.affected} | mitigation: {incident.mitigationStatus}
                  </span>
                  <span className="src-link__url">{sourceUrl}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
