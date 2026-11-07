import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/join`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/me/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
