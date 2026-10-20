import type { MetadataRoute } from "next";
import { offeredLocales, routing } from "@/i18n/routing";
import { helpIndex } from "@/lib/helpContent";
import { absoluteUrl, languageAlternates } from "@/lib/metadata";
import { sitemapPaths } from "@/lib/sitemapPages";

// One entry per page and locale, each with its hreflang alternates, plus
// the published Help articles (the default locale's list).
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = sitemapPaths();
  // The articles only once /help itself is listed (its gate is met).
  const articles = paths.includes("/help") ? helpIndex(routing.defaultLocale).flatMap((g) => g.articles.map((a) => `/help/${a.slug}`)) : [];
  return [...paths, ...articles].flatMap((path) =>
    // Only offered languages: a draft /th is never listed.
    offeredLocales().map((locale) => ({
      url: absoluteUrl(locale, path),
      alternates: { languages: languageAlternates(path) },
    })),
  );
}
