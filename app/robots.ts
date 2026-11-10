import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

/**
 * Generates `/robots.txt`: allows public pages, blocks API and authenticated app routes,
 * and points crawlers to the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/routine", "/history", "/exercises", "/settings"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
