import type { Metadata } from "next";
import { headers } from "next/headers";
import { pageGate } from "@/lib/conditions";
import { dateLocale } from "@/lib/journal/today";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { currentUser } from "@/lib/journal/currentUser";
import { isRange, previousRangeStart, rangeDays, series, type InsightRow, type Range } from "@/lib/journal/insights";
import { loadMilestone } from "@/lib/share/milestoneData";
import { yearOnOffer } from "@/lib/share/year";
import { aiShown, canReflect } from "@/lib/journal/ai";
import { lastWeekStart, parseReportBody, type WeeklyReport as Report } from "@/lib/journal/report";
import { getMe } from "@/lib/journal/me";
import { patterns, patternsWindowStart } from "@/lib/journal/patterns";
import { sixDaysAfter, yourWeek, type YourWeekMoment } from "@/lib/journal/yourWeek";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { YourWeekCard } from "./YourWeekCard";
import { tabMetadata } from "../pageMeta";
import { InsightsView } from "./InsightsView";
import { MorePatternsRow, WeekLine, YearTab } from "./PlusInsights";
import { insightsOffer, plusPriceLabel, readPlusView } from "@/lib/plus/view";
import { ShareMonth } from "./ShareMonth";
import { WeeklyReport } from "./WeeklyReport";

// The weekly report runs in this page's functions and waits up to 45 s
// (REFLECT_SERVER_DEADLINE_MS): the page allows 60, as the entry page does.
export const maxDuration = 60;

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
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;

  const asked = (await searchParams).range;
  const range: Range = isRange(asked) ? asked : "week";
  // Patterns (no AI) use a fixed 90 days on every tab: where they're on,
  // the one read starts early enough for them too (still one request).
  const withPatterns = pageGate("patterns-live") !== "hidden";
  const withYourWeek = pageGate("your-week-live") !== "hidden";
  const chartsStart = previousRangeStart(me.today, range);
  const patternsStart = patternsWindowStart(me.today);
  const { data, error } = await supabase
    .from("check_ins")
    .select("local_date, mood, sleep_hours, stress, exercise_minutes")
    .gte("local_date", [chartsStart, ...(withPatterns ? [patternsStart] : []), ...(withYourWeek ? [lastWeekStart(me.today)] : [])].sort()[0])
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
  // shows as is; a failed read just means the button. AI available but not
  // turned on by this person: the card explains, with no button (UX); AI
  // off for everyone: no card at all (text = enforcement).
  let week: React.ReactNode = null;
  const weekly = pageGate("weekly-report-live") !== "hidden";
  if (weekly && aiShown(me) && !canReflect(me)) {
    week = <WeeklyReport initial={null} weekStart={lastWeekStart(me.today)} dateLocaleTag={dateLocaleTag} balance={0} aiOff />;
  } else if (weekly && canReflect(me)) {
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
  // Your week (specs/your-week.md), no AI: today is the saved time zone's, from
  // get_me. Moments: id and date only, never the body. A failed read: no moment.
  let summary: React.ReactNode = null;
  let hardWeek = false;
  if (withYourWeek) {
    const start = lastWeekStart(me.today);
    const { data: moments } = await supabase.from("entries").select("id, entry_date").eq("is_moment", true).gte("entry_date", start).lte("entry_date", sixDaysAfter(start));
    const result = yourWeek(rows, me.today, (moments ?? []) as YourWeekMoment[]);
    if (result) summary = <YourWeekCard week={result} country={me.profile?.country} dateLocaleTag={dateLocaleTag} />;
    // Plus's quiet line goes under Your week, never under a hard week's help offer.
    hardWeek = result?.kind === "hard";
  }
  // Moodbow Plus (decision 246): its locked items only for someone without
  // Plus, none on a hard week, and nothing at all when the row can't be read.
  const offer = insightsOffer(pageGate("plus") !== "hidden" ? await readPlusView(supabase, user.id) : null, hardWeek, plusPriceLabel(locale));
  return (
    <InsightsView
      rows={rows}
      today={me.today}
      range={range}
      share={share}
      summary={
        offer && summary ? (
          <>
            {summary}
            <WeekLine offer={offer} />
          </>
        ) : (
          summary
        )
      }
      week={week}
      patterns={withPatterns ? patterns(rows, me.today) : undefined}
      plusTab={offer && <YearTab offer={offer} />}
      plusPatterns={offer && withPatterns && <MorePatternsRow offer={offer} />}
    />
  );
}
