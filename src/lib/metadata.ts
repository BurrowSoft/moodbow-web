import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { offeredLocales, routing, type Locale } from "@/i18n/routing";
import { conditionMet } from "./conditions";
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

// hreflang alternates for every offered locale (a draft /th isn't one),
// plus x-default (English).
export function languageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const l of offeredLocales()) languages[l] = absoluteUrl(l, path);
  languages["x-default"] = absoluteUrl(routing.defaultLocale, path);
  return languages;
}

// Open Graph locale codes for the languages we may ship.
const OG_LOCALES: Record<string, string> = { en: "en_US", th: "th_TH", es: "es_ES", "pt-BR": "pt_BR", fr: "fr_FR", de: "de_DE" };

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
  // Launch copy and image once the web journal is live (UX): until then the
  // "Coming soon" description and the image that says so (/og-image.png).
  const live = conditionMet("web-journal-live");
  const image = live ? { url: `${SITE_URL}/og-launch.png`, alt: t("ogImageAltLaunch") } : { url: `${SITE_URL}/og-image.png`, alt: t("ogImageAlt") };
  const siteDescription = live ? t("descriptionLaunch") : t("description");
  const ogDescription = live ? t("ogDescriptionLaunch") : t("ogDescription");
  const fullTitle = title ? t("pageTitle", { title }) : t("title");
  const desc = description ?? siteDescription;
  const url = absoluteUrl(locale, path);
  return {
    title: fullTitle,
    description: desc,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      type: "website",
      siteName: t("siteName"),
      url,
      title: fullTitle,
      description: title ? desc : ogDescription,
      locale: OG_LOCALES[locale] ?? "en_US",
      images: [{ url: image.url, width: 1200, height: 630, alt: image.alt }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: title ? desc : ogDescription,
      images: [image.url],
    },
    robots: noindex ? { index: false, follow: false } : undefined,
  };
}
