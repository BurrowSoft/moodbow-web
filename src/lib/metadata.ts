import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { SITE_URL } from "./site";

// The public URL of a page in a locale: en is unprefixed, others get /<locale>.
// `path` is "/" or "/support" style.
export function localizedPath(locale: Locale, path: string): string {
  if (locale === routing.defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

export function absoluteUrl(locale: Locale, path: string): string {
  return `${SITE_URL}${localizedPath(locale, path)}`;
}

// hreflang alternates for every locale, plus x-default (English).
export function languageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = absoluteUrl(l, path);
  languages["x-default"] = absoluteUrl(routing.defaultLocale, path);
  return languages;
}

type PageMetaInput = {
  locale: Locale;
  path: string;
  // Omitted on the home page, which uses the site title as is.
  title?: string;
  description?: string;
  noindex?: boolean;
};

export async function pageMetadata({ locale, path, title, description, noindex }: PageMetaInput): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "meta" });
  const fullTitle = title ? `${title} · Moodbow` : t("title");
  const desc = description ?? t("description");
  const url = absoluteUrl(locale, path);
  return {
    title: fullTitle,
    description: desc,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      type: "website",
      siteName: "Moodbow",
      url,
      title: fullTitle,
      description: title ? desc : t("ogDescription"),
      locale: locale === "th" ? "th_TH" : "en_US",
      images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: t("ogImageAlt") }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: title ? desc : t("ogDescription"),
      images: [`${SITE_URL}/og-image.png`],
    },
    robots: noindex ? { index: false, follow: false } : undefined,
  };
}
