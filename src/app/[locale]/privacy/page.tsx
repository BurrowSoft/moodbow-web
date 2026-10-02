import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LegalArticle } from "@/components/LegalArticle";
import { pageGate } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";

const GATE = "privacy-text-approved" as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return pageMetadata({
    locale: locale as Locale,
    path: "/privacy",
    title: t("title"),
    description: t("description"),
    noindex: pageGate(GATE) !== "live",
  });
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <LegalArticle slug="privacy" locale={locale} gate={GATE} />;
}
