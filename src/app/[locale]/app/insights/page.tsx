import type { Metadata } from "next";
import { headers } from "next/headers";
import { pageGate } from "@/lib/conditions";
import { dateLocale } from "@/lib/journal/today";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { currentUser } from "@/lib/journal/currentUser";
import { isRange, METRICS, previousRangeStart, rangeDays, series, type InsightRow, type Range } from "@/lib/journal/insights";
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
import { MorePatternsCard, MorePatternsRow, PlusTabs, WeekLine, YearTab } from "./PlusInsights";
import { insightsOffer, plusPriceLabel, readPlusView } from "@/lib/plus/view";
import { isLongRange, longRangeStart, longSummary } from "@/lib/plus/longRange";
import { morePatterns, moreWindowStart } from "@/lib/plus/morePatterns";
import { tagPatterns, tagsByDayFrom, type TagPattern } from "@/lib/plus/tagPatterns";
import { whatLiftsMe, type Lift } from "@/lib/plus/whatLiftsMe";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { periodLine, readCheckInsSince, readWrittenDays } from "@/lib/plus/insightsData";
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
  const freeStart = [chartsStart, ...(withPatterns ? [patternsStart] : []), ...(withYourWeek ? [lastWeekStart(me.today)] : [])].sort()[0];
  // Moodbow Plus (decision 246), read once: null when the row can't be read
  // (then nothing about Plus at all). With Plus: Year and All time, and More
  // patterns over the last 12 months (or all time on All time).
  const plus = pageGate("plus") !== "hidden" ? await readPlusView(supabase, user.id) : null;
  const hasPlus = plus?.kind === "plus";
  const longRange = hasPlus && isLongRange(asked) ? asked : null;
  const moreWindow = longRange === "all" ? "all" : "year";
  let rows: InsightRow[];
  if (hasPlus) {
    // Year needs 24 months (its 12 and the 12 before); More patterns 12; All time everything.
    const plusStart = longRange === "all" ? null : [freeStart, longRange ? longRangeStart(longRange, me.today)! : freeStart, moreWindowStart("year", me.today)!].sort()[0];
    const read = await readCheckInsSince(supabase, plusStart, me.today);
    if (!read) return <JournalUnavailable />;
    rows = read;
  } else {
    const { data, error } = await supabase
      .from("check_ins")
      .select("local_date, mood, sleep_hours, stress, exercise_minutes")
      .gte("local_date", freeStart)
      .lte("local_date", me.today);
    if (error) return <JournalUnavailable />;
    rows = (data ?? []) as InsightRow[];
  }
  // Share: the current month's moodbow (M10), where share cards are on; and,
  // where the 1.1 cards are on too (decision 169), this range's mood line
  // (the chart card) and the milestone reached, if any.
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
  // Its locked items only for someone without Plus, none on a hard week. With
  // Plus, the views are theirs and show on a hard week too, with no offer (UX).
  const offer = insightsOffer(plus, hardWeek, plusPriceLabel(locale));
  let long: React.ComponentProps<typeof InsightsView>["long"];
  if (longRange) {
    const firstCheckIn = rows.length > 0 ? rows[0].local_date : null;
    const charts = {} as NonNullable<typeof long>["charts"];
    for (const m of METRICS) charts[m] = longSummary(rows, me.today, longRange, m, firstCheckIn);
    const { unit, periods } = longSummary(rows, me.today, longRange, "mood", firstCheckIn);
    long = { range: longRange, unit, periodLine: periodLine(periods[0].start, periods[periods.length - 1].end, dateLocaleTag), charts };
  }
  let plusMore: React.ReactNode = null;
  if (hasPlus && withPatterns) {
    const written = await readWrittenDays(supabase, moreWindowStart(moreWindow, me.today), me.today);
    // A failed read of the days written: the card without that line, never a guess.
    // More patterns by tag (UX, 12 Nov), where tags are on: the period's tags, the person's own
    // (RLS). A failed read: no tag lines, never a guess.
    let tagLines: TagPattern[] = [];
    // What lifts me (1.3): from the same rows, computed here and now, never stored or logged.
    let lifts: Lift[] | null = null;
    if (pageGate("tags-live") !== "hidden") {
      const start = moreWindowStart(moreWindow, me.today);
      let query = supabase.from("check_in_tags").select("local_date, tag, created_at").lte("local_date", me.today);
      if (start) query = query.gte("local_date", start);
      const { data: tagRows, error: tagError } = await query;
      if (!tagError && tagRows) {
        const byDay = tagsByDayFrom(tagRows as { local_date: string; tag: string; created_at: string | null }[]);
        tagLines = tagPatterns(rows, me.today, moreWindow, byDay, CRISIS_KEYWORDS);
        lifts = whatLiftsMe(rows, me.today, moreWindow, byDay, CRISIS_KEYWORDS);
      }
    }
    plusMore = <MorePatternsCard window={moreWindow} patterns={morePatterns(rows, me.today, moreWindow, written ?? new Set()).filter((p) => written || p.id !== "writing")} tags={tagLines} lifts={lifts} country={me.profile?.country ?? null} />;
  }
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
      plusTab={hasPlus ? <PlusTabs current={longRange} /> : offer && <YearTab offer={offer} />}
      plusPatterns={hasPlus ? plusMore : offer && withPatterns && <MorePatternsRow offer={offer} />}
      long={long}
    />
  );
}
