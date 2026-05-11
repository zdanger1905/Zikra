import { MetadataRoute } from "next";

const BASE = "https://zikra.io";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE,                     lastModified: new Date(), changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE}/quran`,          lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/prayer-times`,   lastModified: new Date(), changeFrequency: "daily",   priority: 0.8 },
    { url: `${BASE}/recitation`,     lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/adhan`,          lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/quran/identify`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/saved`,          lastModified: new Date(), changeFrequency: "weekly",  priority: 0.5 },
    { url: `${BASE}/history`,        lastModified: new Date(), changeFrequency: "weekly",  priority: 0.5 },
  ];

  const surahRoutes: MetadataRoute.Sitemap = Array.from({ length: 114 }, (_, i) => ({
    url: `${BASE}/quran/${i + 1}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const recitationRoutes: MetadataRoute.Sitemap = Array.from({ length: 114 }, (_, i) => ({
    url: `${BASE}/recitation/${i + 1}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...surahRoutes, ...recitationRoutes];
}
