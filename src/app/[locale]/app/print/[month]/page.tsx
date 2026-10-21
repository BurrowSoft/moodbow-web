import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { pageGate } from "@/lib/conditions";
import { getMe } from "@/lib/journal/me";
import { printDays, type PrintCheckIn, type PrintEntryRow } from "@/lib/journal/printMonth";
import { dateLocale } from "@/lib/journal/today";
import { formatMonth, isMonth, monthRange } from "@/lib/share/moodbow";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tabMetadata, titledMetadata } from "../../pageMeta";
import { PrintMonth } from "./PrintMonth";

// A stuck request ends here at the latest (UX, the timeout audit); each
// data call gives up after 15 s on its own (lib/supabase/deadline).
export const maxDuration = 30;

export async function generateMetadata({ params }: PageProps<"/[locale]/app/print/[month]">): Promise<Metadata> {
  // The month is the title, so "Save as PDF" suggests "October 2026 · Moodbow".
  const { locale, month } = await params;
  if (!isMonth(month)) return tabMetadata("tabTimeline", locale);
  return titledMetadata(formatMonth(month, dateLocale(locale, (await headers()).get("accept-language"), null)), locale);
}

// Print a month (1.1 N, decision 199), behind print-live: one month's
// check-ins and entries, the user's own words only (no AI reflections),
// read through RLS by date range (no text in any request, decision 196) and
// printed by the browser. A malformed or future month is a 404.
export default async function PrintPage({ params }: PageProps<"/[locale]/app/print/[month]">) {
  const { locale, month } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("print-live") === "hidden" || !isMonth(month)) notFound();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;
  if (month > me.today.slice(0, 7)) notFound();

  const { from, to } = monthRange(month);
  const [checkIns, entries] = await Promise.all([
    supabase.from("check_ins").select("local_date, mood, sleep_hours, exercise_minutes, stress").gte("local_date", from).lte("local_date", to),
    supabase.from("entries").select("id, entry_date, body, is_moment, created_at").gte("entry_date", from).lte("entry_date", to),
  ]);
  if (checkIns.error || entries.error) return <JournalUnavailable />;

  const dateLocaleTag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);
  return (
    <PrintMonth
      month={month}
      title={formatMonth(month, dateLocaleTag)}
      days={printDays((checkIns.data ?? []) as PrintCheckIn[], (entries.data ?? []) as PrintEntryRow[])}
      dateLocaleTag={dateLocaleTag}
    />
  );
}
