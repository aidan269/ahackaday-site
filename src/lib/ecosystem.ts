/**
 * Public site base (AHackaday canonical URLs, toolkit links, Grace deep links).
 * NEXT_PUBLIC_GRACE_ORIGIN: Grace deployment origin, no trailing slash.
 */

const DEFAULT_SITE = "https://ahackaday-site.vercel.app";

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

/** Avatar image served by Grace (same asset as in-app chat). */
export function graceAvatarUrl(): string | undefined {
  const base = getGraceOrigin();
  return base ? `${base}/grace-avatar.png` : undefined;
}

export type ToolkitRow = {
  label: string;
  /** Empty when not configured (e.g. Grace without env) */
  href: string;
  /** Show as disabled in UI */
  missing?: boolean;
};

export function getToolkitLinkRows(): ToolkitRow[] {
  const grace = getGraceOrigin();
  return [
    {
      label: "Grace (main app)",
      href: grace ? `${grace}/` : "",
      missing: !grace,
    },
    { label: "AHackaday (this site)", href: `${getPublicSiteUrl()}/?layout=card` },
    { label: "Clowasp (OWASP agentic pipeline auditor)", href: "https://github.com/aidan269/clowasp" },
    { label: "News / intake queue (GitHub issues)", href: "https://github.com/aidan269/grace.ai/issues" },
    { label: "Cantina", href: "https://cantina.xyz" },
  ];
}
