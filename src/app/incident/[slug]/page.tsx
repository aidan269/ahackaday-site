import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AskAI } from "@/components/ask-ai";
import { IncidentComments } from "@/components/incident-comments";
import { IncidentVoteControls } from "@/components/incident-vote-controls";
import { SocialPlatformGraph } from "@/components/social-platform-graph";
import { getPublicSiteUrl } from "@/lib/ecosystem";
import type { SocialDataQuality } from "@/lib/incident-types";
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
  const siteUrl = getPublicSiteUrl();
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

function deriveSocialDetailSignals(input: {
  slug: string;
  title: string;
  category: string;
  summary: string;
  mentions24h?: number;
  cve?: string | null;
  delta24hPct?: number;
  platformSplit?: { x: number; reddit: number; github: number };
  keywords?: string[];
  socialDataQuality?: SocialDataQuality;
}): { platformSplit: string; mentionsDelta: string; keywords: string[] } {
  if (input.socialDataQuality === "live_measured" && input.platformSplit) {
    const split = `X ${input.platformSplit.x}% · Reddit ${input.platformSplit.reddit}% · GitHub ${input.platformSplit.github}%`;
    if (typeof input.delta24hPct === "number") {
      const prefix = input.delta24hPct >= 0 ? "+" : "";
      return {
        platformSplit: split,
        mentionsDelta: `${prefix}${input.delta24hPct}% vs prior snapshot`,
        keywords: (input.keywords ?? []).slice(0, 4),
      };
    }
    return {
      platformSplit: split,
      mentionsDelta: "n/a",
      keywords: (input.keywords ?? []).slice(0, 4),
    };
  }
  if (input.socialDataQuality === "live_zero") {
    return {
      platformSplit: "Last scan returned zero cross-platform mentions (splits not shown).",
      mentionsDelta: "—",
      keywords: (input.keywords ?? []).slice(0, 4),
    };
  }
  return {
    platformSplit: "Live social scan not run yet — open the feed after the next /api/social/refresh.",
    mentionsDelta: "—",
    keywords: [],
  };
}

function normalizeKeywordForDisplay(value: string): string {
  return value.replace(/^#+/, "").trim().toLowerCase();
}

export default async function IncidentPage({ params }: IncidentPageProps) {
  const { slug } = await params;
  const incident = await getIncidentBySlug(slug);
  if (!incident) notFound();

  const sev = SEV_COLOR[incident.severity];
  const trackingId = incident.cve || incident.evidence.cves[0] || null;
  const sections = Array.isArray(incident.content) ? incident.content : [];
  const socialMentionsLabel =
    incident.socialDataQuality === "pending"
      ? "pending scan"
      : typeof incident.socialMentions24h === "number"
        ? String(incident.socialMentions24h)
        : "n/a";
  const trend = incident.socialTrend ?? "flat";
  const socialTrendLabel = `trend ${trend}`;
  const socialSummary = incident.socialSummary || "Signal collection in progress for this incident.";
  const graphSplit = incident.socialDataQuality === "live_measured" ? incident.socialPlatformSplit : undefined;
  const graphSearchTerm = trackingId ?? incident.title;
  const socialDetails = deriveSocialDetailSignals({
    slug: incident.slug,
    title: incident.title,
    category: incident.category,
    summary: incident.summary,
    mentions24h: incident.socialMentions24h,
    cve: trackingId,
    delta24hPct: incident.socialDelta24hPct,
    platformSplit: incident.socialPlatformSplit,
    keywords: incident.socialKeywords,
    socialDataQuality: incident.socialDataQuality,
  });
  const displayKeywords = socialDetails.keywords
    .map(normalizeKeywordForDisplay)
    .filter(Boolean)
    .slice(0, 3);
  const xHeat = incident.xHeatScore ?? 0;
  const xAuthors = incident.xUniqueAuthors24h ?? 0;
  const xVerified = incident.xVerifiedMentions24h ?? 0;
  const xRetweets = incident.xRetweetSum24h ?? 0;
  const xLikes = incident.xLikeSum24h ?? 0;
  const xReplies = incident.xReplySum24h ?? 0;
  const xQuotes = incident.xQuoteSum24h ?? 0;
  const xMentions = incident.xMentions24h ?? 0;
  const xVerifiedPct = xMentions > 0 ? Math.round((xVerified / xMentions) * 100) : 0;
  const xTrendLabel = incident.xHeatTrend ? `(${incident.xHeatTrend})` : "";
  const xEngagementTotal = Math.max(1, xRetweets + xLikes + xReplies + xQuotes);
  const xBars = [
    { label: "likes", value: xLikes },
    { label: "retweets", value: xRetweets },
    { label: "replies", value: xReplies },
    { label: "quotes", value: xQuotes },
  ];

  return (
    <main className="shell">
      <div className="detail-with-ai view-fade">
        <article className={`detail ${incident.severity === "critical" ? "is-critical" : ""}`}>
          <div className="detail__bar">
            <Link href="/" className="back-link">back to feed</Link>
            <IncidentVoteControls incidentSlug={incident.slug} />
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
            <div className="detail__meta-affected">
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

          <div className="detail__social">
            <h3>social pulse</h3>
            <div className="detail__social-grid">
              <div className="detail__social-metric">
                <span className="k">mentions (24h)</span>
                <span className="v">{socialMentionsLabel}</span>
              </div>
              <div className="detail__social-metric">
                <span className="k">velocity</span>
                <span className="v">{socialTrendLabel}</span>
              </div>
              <div className="detail__social-metric">
                <span className="k">mentions delta</span>
                <span className="v">{socialDetails.mentionsDelta}</span>
              </div>
              <div className="detail__social-metric">
                <span className="k">platform split</span>
                <span className="v">{socialDetails.platformSplit}</span>
                {graphSplit ? (
                  <SocialPlatformGraph
                    totalMentions={incident.socialMentions24h ?? 0}
                    split={graphSplit}
                    searchTerm={graphSearchTerm}
                  />
                ) : null}
              </div>
              <div className="detail__social-metric">
                <span className="k">keywords</span>
                <div className="detail__keyword-chips">
                  {displayKeywords.length > 0
                    ? displayKeywords.map((keyword) => (
                        <span key={keyword} className="detail__keyword-chip">{keyword}</span>
                      ))
                    : <span className="detail__keyword-chip">monitoring</span>}
                </div>
              </div>
              <div className="detail__social-metric">
                <span className="k">x analytics</span>
                <span className="v">heat {xHeat} {xTrendLabel}</span>
                <div className="detail__x-meta">
                  <span>authors {xAuthors}</span>
                  <span>verified {xVerifiedPct}%</span>
                </div>
                <div className="detail__x-bars">
                  {xBars.map((bar) => (
                    <div key={bar.label} className="detail__x-bar-row">
                      <span className="detail__x-bar-label">{bar.label}</span>
                      <span className="detail__x-bar-track">
                        <span className="detail__x-bar-fill" style={{ width: `${Math.max(4, Math.round((bar.value / xEngagementTotal) * 100))}%` }} />
                      </span>
                      <span className="detail__x-bar-value">{bar.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="detail__social-summary">
                <span className="k">summary</span>
                <span className="v">{socialSummary}</span>
              </div>
            </div>
          </div>

          <IncidentComments incidentSlug={incident.slug} />

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
        <div className="detail__ask-drawer">
          <AskAI incident={incident} />
        </div>
      </div>
    </main>
  );
}
