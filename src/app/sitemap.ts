import type { MetadataRoute } from "next";

import { getPublicSiteUrl } from "@/lib/ecosystem";
import { getIncidentSlugs } from "@/lib/incidents";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicSiteUrl();
  const slugs = await getIncidentSlugs();
  const now = new Date();

  return [
    { url: `${base}/`, lastModified: now },
    ...slugs.map((slug) => ({
      url: `${base}/incident/${slug}`,
      lastModified: now,
    })),
  ];
}
