/**
 * Public site base (AHackaday canonical URLs, toolkit links, Grace deep links).
 * NEXT_PUBLIC_GRACE_ORIGIN: Grace deployment origin, no trailing slash.
 */

const DEFAULT_SITE = "https://ahackaday-intel.vercel.app";

export function getPublicSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE;
  return raw.replace(/\/$/, "");
}

export function incidentCanonicalUrl(slug: string): string {
  return `${getPublicSiteUrl()}/incident/${slug}`;
}

export function getGraceOrigin(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_GRACE_ORIGIN?.trim();
  if (!raw) return undefined;
  const noHash = raw.split("#")[0].trim().replace(/\/$/, "");
  try {
    const u = new URL(noHash.includes("://") ? noHash : `https://${noHash}`);
    return u.origin;
  } catch {
    return noHash || undefined;
  }
}

export function graceDeepLink(storyUrl: string): string {
  const base = getGraceOrigin();
  if (!base) {
    return "";
  }
  return `${base}/?url=${encodeURIComponent(storyUrl)}#studio`;
}

/** Grace mark for “Open in Grace” and other AHackaday UI (served from this site). */
export function graceAvatarUrl(): string {
  return "/grace-avatar.png";
}

export type ToolkitRow = {
  label: string;
  markdownLabel?: string;
  /** Empty when not configured (e.g. Grace without env) */
  href: string;
  /** Show as disabled in UI */
  missing?: boolean;
  comingSoon?: boolean;
};

export function getToolkitLinkRows(): ToolkitRow[] {
  return [
    {
      label: "Grace Slack implementation",
      markdownLabel: "[Grace Slack implementation](https://github.com/aidan269/grace.ai)",
      href: "https://github.com/aidan269/grace.ai",
    },
    { label: "AHackaday (this site)", href: "", comingSoon: true },
    { label: "Clowasp (OWASP agentic pipeline auditor)", href: "", comingSoon: true },
    { label: "News / intake queue (GitHub issues)", href: "", comingSoon: true },
    { label: "Cantina", href: "", comingSoon: true },
  ];
}
