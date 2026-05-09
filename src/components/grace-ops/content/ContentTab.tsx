"use client";

import type { ContentData } from "../types";
import { EditsStudio } from "./EditsStudio";
import { ScoreCard } from "./ScoreCard";
import { TopicTracks } from "./TopicTracks";

export function ContentTab({
  incidentId: _incidentId,
  data,
}: {
  incidentId: string;
  data: ContentData | null;
}) {
  if (!data) {
    return <p className="ops__content-empty">Not yet scored. Next refresh: 02:00 UTC.</p>;
  }

  const editsSection = data.isAdminViewer ? (
    <EditsStudio recommendations={data.recommendations} />
  ) : (
    <details className="content-edits-public">
      <summary className="content-edits-public__sum">
        show edits ({data.recommendations.length})
      </summary>
      <EditsStudio recommendations={data.recommendations} />
    </details>
  );

  return (
    <div className="ops__content-stack">
      <NumberedSection n={1} title="Score Card" sub="citation-worthiness 0–100">
        <ScoreCard data={data} />
      </NumberedSection>

      <NumberedSection n={2} title="Edits Studio" sub="page-level rewrites generated from this page">
        {editsSection}
      </NumberedSection>

      <NumberedSection n={3} title="Topic Tracks" sub="suggested topics built on this incident">
        <TopicTracks topics={data.topics} />
      </NumberedSection>
    </div>
  );
}

function NumberedSection({
  n,
  title,
  sub,
  children,
}: {
  n: number;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="content-num-sec">
      <header className="content-num-sec__hd">
        <span className="content-num-sec__n">{n}</span>
        <h3 className="content-num-sec__title">{title}</h3>
        <span className="content-num-sec__sub">{sub}</span>
      </header>
      {children}
    </section>
  );
}
