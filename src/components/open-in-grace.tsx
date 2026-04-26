"use client";

import { graceDeepLink, getGraceOrigin, incidentCanonicalUrl } from "@/lib/ecosystem";

type OpenInGraceProps = {
  /** Prefer AHackaday incident page URL (canonical) */
  incidentSlug: string;
  className?: string;
};

const base = "open-in-grace";

export function OpenInGrace({ incidentSlug, className = "" }: OpenInGraceProps) {
  const storyUrl = incidentCanonicalUrl(incidentSlug);
  const origin = getGraceOrigin();
  if (!origin) {
    if (process.env.NODE_ENV === "development") {
      return (
        <span
          className={[base, `${base}--disabled`, className].filter(Boolean).join(" ")}
          title="Set NEXT_PUBLIC_GRACE_ORIGIN in .env.local"
        >
          Open in Grace
        </span>
      );
    }
    return null;
  }
  return (
    <a
      href={graceDeepLink(storyUrl)}
      target="_blank"
      rel="noopener noreferrer"
      className={[base, className].filter(Boolean).join(" ")}
      onClick={(e) => e.stopPropagation()}
    >
      Open in Grace
    </a>
  );
}
