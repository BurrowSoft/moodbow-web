import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { absoluteUrl, languageAlternates } from "@/lib/metadata";
import { sitemapPaths } from "@/lib/sitemapPages";

// One entry per page and locale, each with its hreflang alternates.
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths().flatMap((path) =>
    routing.locales.map((locale) => ({
      url: absoluteUrl(locale, path),
      alternates: { languages: languageAlternates(path) },
    })),
  );
}
