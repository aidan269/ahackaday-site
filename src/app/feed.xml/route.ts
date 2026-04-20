import { getAllIncidents } from "@/lib/incidents";

export const dynamic = "force-static";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeSiteUrl(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value}`;
}

export async function GET(request: Request) {
  const site =
    (process.env.NEXT_PUBLIC_SITE_URL && normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)) ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL &&
      normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL)) ||
    new URL(request.url).origin;
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
