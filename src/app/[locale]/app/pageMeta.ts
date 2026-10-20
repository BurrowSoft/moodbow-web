import { getTranslations } from "next-intl/server";

// The journal pages' titles: a tab's ("Timeline · Moodbow") or a page's own.
// Never indexed: the journal is private.
export async function tabMetadata(titleKey: "tabToday" | "tabTimeline" | "tabInsights" | "tabMe", locale: string) {
  const t = await getTranslations({ locale, namespace: "app" });
  const meta = await getTranslations({ locale, namespace: "meta" });
  return { title: meta("pageTitle", { title: t(titleKey) }), robots: { index: false, follow: false } };
}

// A journal page with its own title ("New entry · Moodbow", a day's date):
// the route announcer reads the title, so each page needs its own (a11y pass).
export async function titledMetadata(title: string, locale: string) {
  const meta = await getTranslations({ locale, namespace: "meta" });
  return { title: meta("pageTitle", { title }), robots: { index: false, follow: false } };
}
