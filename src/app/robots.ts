import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Everything may be crawled; pages that must stay out of search results
// (drafts, /email-confirmed) say so with a noindex meta tag, which crawlers
// can only see if they're allowed to fetch the page.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
