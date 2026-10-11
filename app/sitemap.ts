import type { MetadataRoute } from "next";
import { publicSiteUrl } from "../lib/site-metadata.js";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!publicSiteUrl) return [];

  return [
    {
      url: publicSiteUrl.toString(),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: new URL("/about", publicSiteUrl).toString(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
