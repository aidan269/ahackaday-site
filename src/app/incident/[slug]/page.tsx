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

function toTitleCaseHeading(value: string): string {
  const cleaned = value.replace(/[#*_`]/g, "").trim();
  if (!cleaned) return "";
  return cleaned
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function parseContentSections(raw: unknown): Array<{ h: string; p: string }> {
  if (Array.isArray(raw)) {
    return raw
      .map((sec) => {
        if (!sec || typeof sec !== "object") return null;
        const h = "h" in sec && typeof sec.h === "string" ? sec.h.trim() : "";
        const p = "p" in sec && typeof sec.p === "string" ? sec.p.trim() : "";
        return h && p ? { h, p } : null;
      })
      .filter((sec): sec is { h: string; p: string } => sec !== null);
  }
  if (typeof raw !== "string") return [];

  const text = raw.trim();
  if (!text) return [];
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const sections: Array<{ h: string; p: string }> = [];
  let currentHeading = "";
  let currentParagraph: string[] = [];

  const flush = () => {
    if (!currentHeading || currentParagraph.length === 0) return;
    sections.push({ h: currentHeading, p: currentParagraph.join(" ").replace(/\s+/g, " ").trim() });
    currentParagraph = [];
  };

  for (const line of lines) {
    const headingMatch = /^#{1,3}\s+(.+)$/.exec(line);
    if (headingMatch?.[1]) {
      flush();
      currentHeading = toTitleCaseHeading(headingMatch[1]);
      continue;
    }
    if (!currentHeading && line.length > 0) {
      currentHeading = "What Happened";
    }
    currentParagraph.push(line);
  }
  flush();
  if (sections.length === 0 && text.length > 0) {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length > 0) {
      const s1 = sentences.slice(0, 2).join(" ");
      const s2 = sentences.slice(2, 4).join(" ");
      const s3 = sentences.slice(4, 6).join(" ");
      if (s1) sections.push({ h: "What Happened", p: s1 });
      if (s2) sections.push({ h: "Why This Matters", p: s2 });
      if (s3) sections.push({ h: "Technical Notes", p: s3 });
    }
  }
  return sections;
}

export default async function IncidentPage({ params }: IncidentPageProps) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) notFound();

  const sev = SEV_COLOR[incident.severity];
  const trackingId = incident.evidence.cves[0] ?? /CVE-\d{4}-\d+/i.exec(incident.title)?.[0] ?? "n/a";
  const rawContent = incident.content as unknown;
  const contentSections = parseContentSections(rawContent);
  const plainBody =
    typeof rawContent === "string" ? rawContent.trim() : "";
  const summaryLower = incident.summary.trim().toLowerCase();
  const titleLower = incident.title.trim().toLowerCase();
  const plainBodyLower = plainBody.toLowerCase();
  const showPlainBody =
    plainBody.length > 0 &&
    plainBodyLower !== summaryLower &&
    plainBodyLower !== titleLower &&
    plainBodyLower !== `${incident.title} ${incident.summary}`.trim().toLowerCase();

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
          ) : showPlainBody ? (
            <p>{incident.content}</p>
          ) : (
            <p style={{ color: "var(--fg-muted)" }}>source did not provide sectioned body content.</p>
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
