import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LegalArticle } from "@/components/LegalArticle";
import { pageGate } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";

const GATE = "terms-text-approved" as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "terms" });
  return pageMetadata({
    locale: locale as Locale,
    path: "/terms",
    title: t("title"),
    description: t("description"),
    noindex: pageGate(GATE) !== "live",
  });
}

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <LegalArticle slug="terms" locale={locale} gate={GATE} />;
}
