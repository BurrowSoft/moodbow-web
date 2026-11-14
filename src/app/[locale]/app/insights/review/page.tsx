import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { pageGate } from "@/lib/conditions";
import { currentUser } from "@/lib/journal/currentUser";
import type { InsightRow } from "@/lib/journal/insights";
import { getMe } from "@/lib/journal/me";
import { dateLocale } from "@/lib/journal/today";
import { readJournalDates } from "@/lib/plus/insightsData";
import { periodsWithData } from "@/lib/plus/journalPdf";
import { readPlusView } from "@/lib/plus/view";
import { isReviewYear, yearReview } from "@/lib/plus/yearReview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { titledMetadata } from "../../pageMeta";
import { YearReviewView } from "./YearReviewView";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/insights/review">): Promise<Metadata> {
  const { locale } = await params;
  return titledMetadata((await getTranslations({ locale, namespace: "plus" }))("rowReview"), locale);
}

// Insights → Year in review (Plus, decision 246, flag "plus"). The person's
// own check-ins and entries through RLS: one year's check-ins (at most 366),
// how many entries, and the moments' dates and text for their opening words.
// Without Plus: the Plus screen.
export default async function YearReviewPage({ params, searchParams }: PageProps<"/[locale]/app/insights/review">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("plus") === "hidden") notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const [me, view] = await Promise.all([getMe(supabase), readPlusView(supabase, user.id)]);
  if (!me || !view) return <JournalUnavailable />;
  if (view.kind !== "plus") return redirect({ href: "/app/me/plus", locale });

  const dates = await readJournalDates(supabase, me.today);
  if (!dates) return <JournalUnavailable />;
  const { years } = periodsWithData(dates);
  const asked = (await searchParams).year;
  const year = isReviewYear(asked, me.today) ? asked : (years[0] ?? me.today.slice(0, 4));
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [checkIns, entries, moments] = await Promise.all([
    supabase.from("check_ins").select("local_date, mood, sleep_hours, stress, exercise_minutes").gte("local_date", from).lte("local_date", to),
    supabase.from("entries").select("id", { count: "exact", head: true }).gte("entry_date", from).lte("entry_date", to),
    supabase.from("entries").select("id, entry_date, body").eq("is_moment", true).gte("entry_date", from).lte("entry_date", to),
  ]);
  if (checkIns.error || entries.error || moments.error) return <JournalUnavailable />;

  const ta = await getTranslations("app");
  const tag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);
  return (
    <YearReviewView
      year={year}
      years={years}
      soFar={year === me.today.slice(0, 4)}
      review={yearReview(year, (checkIns.data ?? []) as InsightRow[], entries.count ?? 0, (moments.data ?? []) as { id: string; entry_date: string; body: string }[])}
      country={me.profile?.country}
      backLabel={ta("navBackTo", { screen: ta("tabInsights") })}
      dateLocaleTag={tag}
    />
  );
}
