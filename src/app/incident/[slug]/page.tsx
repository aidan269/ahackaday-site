import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
            <span className="sev-chip" style={{ ["--sev" as string]: sev } as React.CSSProperties}>
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

        <div className="detail__body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{incident.content}</ReactMarkdown>
        </div>

        <section className="detail__sources">
          <h3>sources</h3>
          <ul>
            {incident.sources.map((s) => (
              <li key={s}>
                <a href={s} target="_blank" rel="noreferrer">{s}</a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
