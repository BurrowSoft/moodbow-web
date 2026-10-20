import type { MetadataRoute } from "next";
import { ALL_LOCALES } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site";

// The public pages may be crawled; the journal (/app) and the auth links
// (/auth: single-use tokens) have nothing for search and stay out. Pages
// that must stay out of results but can be reached (drafts,
// /email-confirmed) say so with a noindex meta tag, which crawlers can only
// see if they may fetch the page, so those aren't disallowed here. Previews
// are behind Vercel's deployment protection, so crawlers never reach them.
// "/app" (no slash): rules are prefix matches, so it covers /app itself
// (Today) and everything under it, and the same under every other
// language's prefix (/th, 1.1 F).
export default function robots(): MetadataRoute.Robots {
  const others = ALL_LOCALES.filter((l) => l !== "en");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/auth/", ...others.flatMap((l) => [`/${l}/app`, `/${l}/auth/`])] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
