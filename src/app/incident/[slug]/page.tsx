import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  formatIncidentDate,
  getAllIncidents,
  getIncidentBySlug,
  getSeverityTone,
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
  if (!incident) {
    return { title: "Incident Not Found" };
  }

  return {
    title: `${incident.title} | AHackaday`,
    description: incident.summary,
  };
}

export default async function IncidentPage({ params }: IncidentPageProps) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
      <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-100">
        ← Back to feed
      </Link>

      <article className="mt-2 border border-zinc-800 bg-zinc-900/30 p-3.5 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <time className="text-zinc-400">{formatIncidentDate(incident.date)}</time>
          <span className={`border px-1.5 py-0.5 uppercase ${getSeverityTone(incident.severity)}`}>
            {incident.severity}
          </span>
          <span className="text-zinc-500">{incident.category}</span>
        </div>

        <h1 className="text-xl font-semibold leading-tight text-zinc-100">{incident.title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{incident.summary}</p>

        <dl className="mt-3 grid gap-2 border-y border-zinc-800 py-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">What&apos;s Affected</dt>
            <dd className="text-zinc-200">{incident.affected}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Mitigation Status</dt>
            <dd className="text-zinc-200">{incident.mitigationStatus}</dd>
          </div>
        </dl>

        <div className="prose prose-invert prose-sm mt-4 max-w-none prose-p:leading-relaxed prose-headings:text-zinc-100 prose-a:text-cyan-300">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{incident.content}</ReactMarkdown>
        </div>

        <section className="mt-4">
          <h2 className="mb-1.5 text-sm font-semibold text-zinc-100">Sources</h2>
          <ul className="space-y-1 text-sm text-zinc-300">
            {incident.sources.map((source) => (
              <li key={source}>
                <a
                  href={source}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-300 hover:text-cyan-200"
                >
                  {source}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </main>
  );
}
