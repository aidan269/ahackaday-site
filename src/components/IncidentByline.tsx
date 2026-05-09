import Link from "next/link";

import { formatIncidentDate } from "@/lib/incidents";
import { SITE_CURATOR } from "@/lib/site-meta";

export function IncidentByline({ publishedAt }: { publishedAt: string }) {
  return (
    <div className="detail__byline">
      <em>
        Curated {formatIncidentDate(publishedAt)} by{" "}
        <strong>{SITE_CURATOR.name}</strong>, {SITE_CURATOR.credentials}.
        <span className="sep">/</span>
        <Link href={SITE_CURATOR.methodologyPath}>Methodology</Link>
        <span className="sep">/</span>
        Sources verified.
      </em>
    </div>
  );
}
