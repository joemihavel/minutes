import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://tryminutes.vercel.app";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/s/", "/workspace/"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
