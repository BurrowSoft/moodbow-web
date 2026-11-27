import { getTranslations } from "next-intl/server";
import { aiShown } from "@/lib/journal/ai";
import { insightsName } from "@/lib/journal/insightsName";
import { getMe } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The journal pages' titles: a tab's ("Timeline · Moodbow") or a page's own.
// Never indexed: the journal is private.
export async function tabMetadata(titleKey: "tabToday" | "tabTimeline" | "tabInsights" | "tabInsightsNoAi" | "tabMe", locale: string) {
  const t = await getTranslations({ locale, namespace: "app" });
  const meta = await getTranslations({ locale, namespace: "meta" });
  return { title: meta("pageTitle", { title: t(titleKey) }), robots: { index: false, follow: false } };
}

// Insights' pages: the tab's name for this person (insightsName), worked out on the server from the
// same `me` the layout and the page read (React's cache: one client, one get_me per request), so the
// title is right in the first HTML and never flips. No client or no `me`: no AI word.
export async function insightsMetadata(locale: string) {
  const supabase = await createSupabaseServerClient();
  const me = supabase ? await getMe(supabase).catch(() => null) : null;
  return tabMetadata(insightsName(me ? aiShown(me) : false).tab, locale);
}

// A journal page with its own title ("New entry · Moodbow", a day's date):
// the route announcer reads the title, so each page needs its own (a11y pass).
export async function titledMetadata(title: string, locale: string) {
  const meta = await getTranslations({ locale, namespace: "meta" });
  return { title: meta("pageTitle", { title }), robots: { index: false, follow: false } };
}
