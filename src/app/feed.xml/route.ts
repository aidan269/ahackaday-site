import { headers } from "next/headers";

import { getPublicSiteUrl } from "@/lib/ecosystem";
import { getAllIncidents } from "@/lib/incidents";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeSiteUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

/** Prefer request-time deployment origin so RSS links are not stuck to a dev URL baked at build. */
function siteFromForwarded(h: Headers): string | null {
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host || /^(localhost|127\.0\.0\.1)(:|$)/i.test(host)) return null;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return normalizeSiteUrl(`${proto}://${host}`);
}

function siteFromVercelRuntime(): string | null {
  if (process.env.VERCEL !== "1") return null;
  const host = process.env.VERCEL_URL?.trim();
  if (!host) return null;
  return normalizeSiteUrl(host);
}

export async function GET() {
  const h = await headers();
  const site = siteFromForwarded(h) ?? siteFromVercelRuntime() ?? getPublicSiteUrl();
  const incidents = await getAllIncidents();

  const items = incidents
    .map((incident) => {
      const url = `${site}/incident/${incident.slug}`;
      return `<item>
  <title>${escapeXml(incident.title)}</title>
  <link>${url}</link>
  <guid>${url}</guid>
  <pubDate>${new Date(incident.date).toUTCString()}</pubDate>
  <description>${escapeXml(incident.summary)}</description>
</item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>AHackaday</title>
  <link>${site}</link>
  <description>Major cybersecurity incidents with broad impact.</description>
  ${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
