import type { Metadata } from "next";
import Link from "next/link";

import { SITE_CURATOR } from "@/lib/site-meta";

export const metadata: Metadata = {
  title: "Editorial methodology | AHackaday",
  description: "How AHackaday curates incident briefs, verifies sources, and scores pages for citation-worthiness.",
};

export default function MethodologyPage() {
  return (
    <main className="shell">
      <article className="detail methodology-page">
        <div className="detail__bar">
          <Link href="/" className="back-link">back to feed</Link>
        </div>
        <div className="methodology-page__inner">
          <h1 className="detail__title">Editorial methodology</h1>
          <p className="detail__lead">
            AHackaday publishes per-incident threat intelligence with a bias toward what security and platform teams
            need to act quickly: affected scope, mitigation posture, and source-backed claims.
          </p>

          <section className="methodology-page__section">
            <h2>Source verification</h2>
            <p>
              Each incident links to primary material (vendor advisories, regulator filings, or first-party
              disclosures). We do not treat social reposts as primary evidence unless they point back to an
              authoritative document. The on-page provenance drawer lists structured claims and how they were
              inferred or confirmed.
            </p>
          </section>

          <section className="methodology-page__section">
            <h2>Brief construction</h2>
            <p>
              The lead paragraph summarizes the event in plain language. Key facts (CVE when known, disclosure timing,
              affected products, exploitation signals) are surfaced in a dedicated block so readers and retrieval systems
              can extract them without parsing long prose. Operational subheadings are phrased as the questions
              practitioners ask search and AI systems.
            </p>
          </section>

          <section className="methodology-page__section">
            <h2>Citation-worthiness (AEO / GEO)</h2>
            <p>
              We run periodic checks against an internal rubric inspired by answer-engine optimization: direct answers,
              quantified risk, structure, authority links, freshness, and topical depth. Scores inform an internal
              &quot;Content&quot; lane on incident pages; they do not replace human editorial judgment.
            </p>
          </section>

          <section className="methodology-page__section">
            <h2>Human curation</h2>
            <p>
              Briefs are edited and published under the name <strong>{SITE_CURATOR.name}</strong> ({SITE_CURATOR.credentials}).
              Automated pipelines may draft or enrich text; published pages are reviewed for accuracy and tone before
              they are treated as canonical.
            </p>
          </section>

          <p className="methodology-page__foot">
            <Link href="/">Return to the feed</Link>
          </p>
        </div>
      </article>
    </main>
  );
}
