import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { isRange, previousRangeStart, type InsightRow, type Range } from "@/lib/journal/insights";
import { getMe } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tabMetadata } from "../TabPlaceholder";
import { InsightsView } from "./InsightsView";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/insights">): Promise<Metadata> {
  return tabMetadata("tabInsights", (await params).locale);
}

// Insights (M6): mood, sleep, stress and exercise over a rolling Week /
// Month / 3 months ending on the user's today (?range=). From the check-ins
// only: an RLS select of this range and the one before (at most 180 rows,
// no entry text). The rules are the app's (agreed with Mobile Dev).
export default async function InsightsPage({ params, searchParams }: PageProps<"/[locale]/app/insights">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;

  const asked = (await searchParams).range;
  const range: Range = isRange(asked) ? asked : "week";
  const { data, error } = await supabase
    .from("check_ins")
    .select("local_date, mood, sleep_hours, stress, exercise_minutes")
    .gte("local_date", previousRangeStart(me.today, range))
    .lte("local_date", me.today);
  if (error) return <JournalUnavailable />;
  return <InsightsView rows={(data ?? []) as InsightRow[]} today={me.today} range={range} />;
}
