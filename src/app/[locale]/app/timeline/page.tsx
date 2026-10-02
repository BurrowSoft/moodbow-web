import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { TabPlaceholder, tabMetadata } from "../TabPlaceholder";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/timeline">): Promise<Metadata> {
  return tabMetadata("tabTimeline", (await params).locale);
}

export default async function TimelinePage({ params }: PageProps<"/[locale]/app/timeline">) {
  setRequestLocale((await params).locale as Locale);
  return <TabPlaceholder titleKey="tabTimeline" />;
}
