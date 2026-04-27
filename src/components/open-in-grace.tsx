"use client";

import {
  graceDeepLink,
  graceFaviconUrl,
  getGraceOrigin,
  incidentCanonicalUrl,
} from "@/lib/ecosystem";

type OpenInGraceProps = {
  /** Prefer AHackaday incident page URL (canonical) */
  incidentSlug: string;
  className?: string;
};

const base = "open-in-grace";

export function OpenInGrace({ incidentSlug, className = "" }: OpenInGraceProps) {
  const storyUrl = incidentCanonicalUrl(incidentSlug);
  const origin = getGraceOrigin();
  const iconSrc = graceFaviconUrl();
  const label = "Open in Grace";

  if (!origin) {
    if (process.env.NODE_ENV === "development") {
      return (
        <span
          className={[base, `${base}--disabled`, className].filter(Boolean).join(" ")}
          title="Set NEXT_PUBLIC_GRACE_ORIGIN in .env.local"
          aria-label={label}
        >
          <img
            className={`${base}__icon`}
            src="/grace-glyph.svg"
            alt=""
            width={18}
            height={18}
            decoding="async"
          />
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
      title={label}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
    >
      <img
        className={`${base}__icon`}
        src={iconSrc}
        alt=""
        width={18}
        height={18}
        decoding="async"
      />
    </a>
  );
}
