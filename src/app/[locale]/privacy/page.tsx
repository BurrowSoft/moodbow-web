import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LegalSkeleton } from "@/components/LegalSkeleton";
import { pageGate } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";

const GATE = "privacy-text-approved" as const;
const SECTIONS = ["whoWeAre", "whatWeCollect", "howWeUse", "ai", "whereStored", "retention", "rights", "contact"] as const;

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
  return <LegalSkeleton namespace="privacy" gate={GATE} sections={SECTIONS} />;
}
