import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { TabPlaceholder, tabMetadata } from "../TabPlaceholder";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/insights">): Promise<Metadata> {
  return tabMetadata("tabInsights", (await params).locale);
}

export default async function InsightsPage({ params }: PageProps<"/[locale]/app/insights">) {
  setRequestLocale((await params).locale as Locale);
  return <TabPlaceholder titleKey="tabInsights" />;
}
