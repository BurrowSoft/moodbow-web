import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { pageGate } from "@/lib/conditions";
import { currentUser } from "@/lib/journal/currentUser";
import { getMe } from "@/lib/journal/me";
import { previewToday } from "@/lib/journal/previewToday";
import { dateLocale } from "@/lib/journal/today";
import { loadYearReview } from "@/lib/journal/yearReviewData";
import { readPlusView } from "@/lib/plus/view";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { titledMetadata } from "../pageMeta";
import { YearView } from "./YearView";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/year">): Promise<Metadata> {
  const { locale } = await params;
  return titledMetadata((await getTranslations({ locale, namespace: "year" }))("title"), locale);
}

// Your year in Moodbow (1.4 A, year-review-live): for everyone, Free and Plus alike. The person's
// own rows through RLS, read on each visit and never stored (lib/journal/yearReviewData). A
// Preview's ?today= stands in for the profile's today (lib/journal/previewToday; never on
// Production). With Plus, the last screen also leads to the Plus Year in review.
export default async function YearPage({ params, searchParams }: PageProps<"/[locale]/app/year">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("year-review-live") === "hidden") notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const plusOn = pageGate("plus") !== "hidden";
  const [me, view, requestHeaders] = await Promise.all([getMe(supabase), plusOn ? readPlusView(supabase, user.id).catch(() => null) : null, headers()]);
  if (!me) return <JournalUnavailable />;
  const today = previewToday((await searchParams).today, me.today);
  const review = await loadYearReview(supabase, today);
  if (!review) return <JournalUnavailable />;
  const dateLocaleTag = dateLocale(locale, requestHeaders.get("accept-language"), me.profile?.country ?? null);
  const share = pageGate("share-cards") !== "hidden" && pageGate("year-card") !== "hidden";
  return <YearView review={review} country={me.profile?.country} dateLocaleTag={dateLocaleTag} share={share} morePlus={view?.kind === "plus"} />;
}
