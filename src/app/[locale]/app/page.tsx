import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { TabPlaceholder, tabMetadata } from "./TabPlaceholder";

export async function generateMetadata({ params }: PageProps<"/[locale]/app">): Promise<Metadata> {
  return tabMetadata("tabToday", (await params).locale);
}

export default async function TodayPage({ params }: PageProps<"/[locale]/app">) {
  setRequestLocale((await params).locale as Locale);
  return <TabPlaceholder titleKey="tabToday" />;
}
