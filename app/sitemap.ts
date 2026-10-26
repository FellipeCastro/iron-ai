import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { PRIVACY_URL, TERMS_URL } from "@/lib/routes";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}${PRIVACY_URL}`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}${TERMS_URL}`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
