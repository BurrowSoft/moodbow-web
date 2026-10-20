import type { Metadata } from "next";
import { headers } from "next/headers";
import { pageGate } from "@/lib/conditions";
import { dateLocale } from "@/lib/journal/today";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { isRange, previousRangeStart, rangeDays, series, type InsightRow, type Range } from "@/lib/journal/insights";
import { loadMilestone } from "@/lib/share/milestoneData";
import { yearOnOffer } from "@/lib/share/year";
import { canReflect } from "@/lib/journal/ai";
import { lastWeekStart, parseReportBody, type WeeklyReport as Report } from "@/lib/journal/report";
import { getMe } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tabMetadata } from "../pageMeta";
import { InsightsView } from "./InsightsView";
import { ShareMonth } from "./ShareMonth";
import { WeeklyReport } from "./WeeklyReport";

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
  // Share: the current month's moodbow (M10), where share cards are on; and,
  // where the 1.1 cards are on too (decision 169), this range's mood line
  // (the chart card) and the milestone reached, if any.
  const rows = (data ?? []) as InsightRow[];
  const more = pageGate("share-cards-more") !== "hidden";
  const dateLocaleTag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);
  const share =
    pageGate("share-cards") !== "hidden" ? (
      <ShareMonth
        month={me.today.slice(0, 7)}
        dateLocaleTag={dateLocaleTag}
        chart={more ? { range, moods: series(rows, rangeDays(me.today, range), "mood") } : undefined}
        milestone={more ? await loadMilestone(supabase) : undefined}
        year={pageGate("year-card") !== "hidden" ? yearOnOffer(me.today) : null}
      />
    ) : null;
  // Your week (1.1 D): the last complete week's report, where AI is on for
  // this user and the weekly report is (weekly-report-live). A stored one
  // shows as is; a failed read just means the button.
  let week: React.ReactNode = null;
  if (pageGate("weekly-report-live") !== "hidden" && canReflect(me)) {
    const weekStart = lastWeekStart(me.today);
    const { data: stored } = await supabase
      .from("ai_reports")
      .select("id, period_start, body, tier, created_at")
      .eq("kind", "weekly")
      .eq("period_start", weekStart)
      .maybeSingle();
    const row = stored as { id: string; period_start: string; body: unknown; tier: string; created_at: string } | null;
    const body = row ? parseReportBody(row.body) : null;
    const initial: Report | null = row && body ? { id: row.id, week_start: row.period_start, body, tier: row.tier === "lite" ? "lite" : "full", created_at: row.created_at } : null;
    week = <WeeklyReport initial={initial} weekStart={weekStart} dateLocaleTag={dateLocaleTag} balance={me.credits?.balance ?? 0} country={me.profile?.country ?? null} />;
  }
  return <InsightsView rows={rows} today={me.today} range={range} share={share} week={week} />;
}
