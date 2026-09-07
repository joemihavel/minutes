import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = "https://tryminutes.vercel.app";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/s/", "/workspace/"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
