import type { MetadataRoute } from "next";

import { getPublicSiteUrl } from "@/lib/ecosystem";

export default function robots(): MetadataRoute.Robots {
  const base = getPublicSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
