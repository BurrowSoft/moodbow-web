import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LegalArticle } from "@/components/LegalArticle";
import { pageGate } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";

const GATE = "consumer-health-data-approved" as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/consumer-health-data">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "consumerHealthData" });
  return pageMetadata({
    locale: locale as Locale,
    path: "/consumer-health-data",
    title: t("title"),
    description: t("description"),
    noindex: pageGate(GATE) !== "live",
  });
}

export default async function ConsumerHealthDataPage({ params }: PageProps<"/[locale]/consumer-health-data">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <LegalArticle slug="consumer-health-data" locale={locale} gate={GATE} />;
}
