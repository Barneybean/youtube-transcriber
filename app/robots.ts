import type { MetadataRoute } from "next";
import { publicSiteUrl } from "../lib/site-metadata.js";

export default function robots(): MetadataRoute.Robots {
  if (!publicSiteUrl) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  const rules: MetadataRoute.Robots["rules"] = {
    userAgent: ["*", "OAI-SearchBot"],
    allow: ["/", "/about"],
    disallow: ["/api/", "/library/", "/settings/", "/transcripts/"],
  };

  return {
    rules,
    sitemap: new URL("/sitemap.xml", publicSiteUrl).toString(),
  };
}
