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
import { lastWeekStart, parseReportBody, weekRange, type WeeklyReport as Report } from "@/lib/journal/report";
import { readReflections, REFLECTIONS_PREVIEW } from "@/lib/journal/reflections";
import { getMe } from "@/lib/journal/me";
import { patterns, patternsWindowStart, routineLines } from "@/lib/journal/patterns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tabMetadata } from "../pageMeta";
import { InsightsHeading, InsightsView } from "./InsightsView";
import { InsightsTabs, type InsightsSegment } from "./InsightsTabs";
import { AiPane, WeekPlusPrompt } from "./AiPane";
import { MorePatternsCard, PlusTabs } from "./PlusInsights";
import { InsightsExample } from "./InsightsExample";
import { GetHelpNow } from "@/components/SafetyCard";
import { readPlusView } from "@/lib/plus/view";
import { isLongRange, longRangeStart, longSummary } from "@/lib/plus/longRange";
import { morePatterns, moreWindowStart } from "@/lib/plus/morePatterns";
import { tagPatterns, tagsByDayFrom, type TagPattern } from "@/lib/plus/tagPatterns";
import { whatLiftsMe, type Lift } from "@/lib/plus/whatLiftsMe";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { periodLine, readCheckInsSince, readWrittenDays } from "@/lib/plus/insightsData";
import { ShareMonth } from "./ShareMonth";
import { WeeklyReport } from "./WeeklyReport";
import { INSIGHTS_TAB_RANGE, showedUpShown } from "@/lib/journal/showedUp";
import { previewToday, previewTodayQuery } from "@/lib/journal/previewToday";
import { loadInsightsRowYear } from "@/lib/journal/yearReviewData";
import { readRoutineWithTicks } from "@/lib/journal/routineData";
import { YearInsightsRow } from "../year/YearLink";

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
// Where AI is available (aiShown), two segments, Patterns | AI (decision 258, specs/insights-ai-split.md):
// Patterns is all of the above; AI is the person's reflections and the weekly report (or, with AI off
// for them, one invitation). Where AI isn't available there's no control and no AI word at all: the page
// is Patterns alone, as before, minus the weekly report.
export default async function InsightsPage({ params, searchParams }: PageProps<"/[locale]/app/insights">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;

  const search = await searchParams;
  const asked = search.range;
  const range: Range = isRange(asked) ? asked : "week";
  // Patterns (no AI) use a fixed 90 days on every tab: where they're on,
  // the one read starts early enough for them too (still one request).
  const withPatterns = pageGate("patterns-live") !== "hidden";
  const chartsStart = previousRangeStart(me.today, range);
  const patternsStart = patternsWindowStart(me.today);
  const more = pageGate("share-cards-more") !== "hidden";
  const shareOn = pageGate("share-cards") !== "hidden";
  const weekly = pageGate("weekly-report-live") !== "hidden";
  const plusOn = pageGate("plus") !== "hidden";
  const weekStart = lastWeekStart(me.today);
  const freeStart = [chartsStart, ...(withPatterns ? [patternsStart] : [])].sort()[0];
  // Insights → AI: anything AI only where it's available; the person's own reflections only where AI is on for them.
  const available = aiShown(me);
  const aiOn = canReflect(me);
  // The page's reads all need only `me`, so they start together (the Web Dev's LCP read, 12 Nov:
  // each one in turn cost a round trip to the database). Same reads, same results. Moodbow Plus's
  // view is one of them (decision 246): null when its row can't be read (then nothing about Plus).
  // Your year in Moodbow's row (1.4 A): read with the rest. A Preview's ?today= stands in (never on
  // Production). The AI segment's reads too, only where AI is on: the 3 newest reflections, and whether
  // there's a past report (for its link, with Plus).
  const yearToday = previewToday(search.today, me.today);
  const yearOn = pageGate("year-review-live") !== "hidden";
  const [checkIns, plus, milestone, stored, requestHeaders, rowYear, routineItems, reflections, reports] = await Promise.all([
    supabase
      .from("check_ins")
      .select("local_date, mood, sleep_hours, stress, exercise_minutes")
      .gte("local_date", freeStart)
      .lte("local_date", me.today),
    plusOn ? readPlusView(supabase, user.id) : null,
    shareOn && more ? loadMilestone(supabase) : undefined,
    weekly && aiOn
      ? supabase.from("ai_reports").select("id, period_start, body, tier, created_at").eq("kind", "weekly").eq("period_start", weekStart).maybeSingle()
      : null,
    headers(),
    yearOn ? loadInsightsRowYear(supabase, yearToday).catch(() => null) : null,
    // 1.4 F (routine-live): the items and their ticks over the patterns window.
    withPatterns ? readRoutineWithTicks(supabase, patternsStart, me.today).catch(() => null) : null,
    aiOn ? readReflections(supabase, REFLECTIONS_PREVIEW).catch(() => null) : null,
    aiOn && weekly && plusOn ? supabase.from("ai_reports").select("id", { count: "exact", head: true }).eq("kind", "weekly") : null,
  ]);
  const dateLocaleTag = dateLocale(locale, requestHeaders.get("accept-language"), me.profile?.country ?? null);
  const hasPlus = plus?.kind === "plus";

  // Your week (1.1 D), in Insights → AI where AI is on for this person and the weekly report is
  // (weekly-report-live): the last complete week's report. A stored one shows as is; a failed read
  // just means the button. Someone without Plus: its example line and See Plus (UX, 25 Nov).
  const week = (withPlus: boolean): React.ReactNode => {
    if (!weekly || !aiOn) return null;
    if (!withPlus) return <WeekPlusPrompt />;
    const row = (stored?.data ?? null) as { id: string; period_start: string; body: unknown; tier: string; created_at: string } | null;
    const body = row ? parseReportBody(row.body) : null;
    const initial: Report | null = row && body ? { id: row.id, week_start: row.period_start, body, tier: row.tier === "lite" ? "lite" : "full", created_at: row.created_at } : null;
    return <WeeklyReport initial={initial} weekStart={weekStart} weekLabel={weekRange(weekStart, dateLocaleTag)} dateLocaleTag={dateLocaleTag} balance={me.credits?.balance ?? 0} country={me.profile?.country ?? null} />;
  };
  // The segments, only where AI is available (else the page is Patterns alone, with its own heading).
  // ?view=ai opens on AI (without scripts too); else Patterns, then the last choice on this device.
  const named = available && search.view === "ai";
  const initial: InsightsSegment = named ? "ai" : "patterns";
  const rangeQuery = typeof asked === "string" && asked !== "week" && (isRange(asked) || (hasPlus && isLongRange(asked))) ? `range=${asked}` : "";
  const hrefs = { patterns: `/app/insights${rangeQuery ? `?${rangeQuery}` : ""}`, ai: `/app/insights?view=ai${rangeQuery ? `&${rangeQuery}` : ""}` };
  const withSegments = (patternsPane: React.ReactNode, heading: React.ReactNode, withPlus: boolean) =>
    available ? (
      <section>
        {heading}
        <InsightsTabs
          initial={initial}
          named={named}
          hrefs={hrefs}
          patterns={patternsPane}
          ai={
            aiOn ? (
              <AiPane state="on" reflections={reflections} dateLocaleTag={dateLocaleTag} week={week(withPlus)} pastReports={hasPlus && (reports?.count ?? 0) > 0} />
            ) : (
              <AiPane state="off" />
            )
          }
        />
      </section>
    ) : (
      patternsPane
    );

  // With Plus: Year and All time, and More patterns over the last 12 months (or all time on All time).
  // Insights are Plus (spec "Insights become Plus", 14 Nov): without Plus (or with a payment that
  // failed), the labelled example and nothing of theirs. A row that can't be read, or Plus off,
  // shows their own Insights as before (ruling 5). The gate is here and on the route only, never in
  // lib/journal/insights, which the appointment summary uses (ruling 2).
  // Your year in Moodbow's row (1.4 A), for everyone: December and January always; otherwise only
  // when a complete year has 30 days, naming the year the page will show (UX, 18 Nov).
  const yearRow = rowYear !== null ? <YearInsightsRow year={rowYear} query={previewTodayQuery(yearToday, me.today)} /> : undefined;
  if (plus && plus.kind !== "plus") {
    const help = <GetHelpNow country={me.profile?.country} testId="insights-example-help" counted neutral icon />;
    return withSegments(<InsightsExample yearRow={yearRow} help={help} heading={!available} />, <InsightsHeading help={help} />, false);
  }
  const longRange = hasPlus && isLongRange(asked) ? asked : null;
  const moreWindow = longRange === "all" ? "all" : "year";
  let rows: InsightRow[];
  if (hasPlus) {
    // Only with Plus, one read more, further back (it needs the view first): Year needs 24 months
    // (its 12 and the 12 before), More patterns 12, All time everything. Without Plus, the page
    // keeps the single parallel read above.
    const plusStart = longRange === "all" ? null : [freeStart, longRange ? longRangeStart(longRange, me.today)! : freeStart, moreWindowStart("year", me.today)!].sort()[0];
    const read = await readCheckInsSince(supabase, plusStart, me.today);
    if (!read) return <JournalUnavailable />;
    rows = read;
  } else {
    const { data, error } = checkIns;
    if (error) return <JournalUnavailable />;
    rows = (data ?? []) as InsightRow[];
  }
  // Share: the current month's moodbow (M10), where share cards are on; and,
  // where the 1.1 cards are on too (decision 169), this range's mood line
  // (the chart card) and the milestone reached, if any.
  const share = shareOn ? (
    <ShareMonth
      month={me.today.slice(0, 7)}
      dateLocaleTag={dateLocaleTag}
      chart={more ? { range, moods: series(rows, rangeDays(me.today, range), "mood") } : undefined}
      milestone={more ? milestone : undefined}
      year={pageGate("year-card") !== "hidden" ? yearOnOffer(me.today) : null}
    />
  ) : null;
  // Your week moved to Today, for everyone (ruling 1): its hard-week help never waits behind Plus.
  let long: React.ComponentProps<typeof InsightsView>["long"];
  if (longRange) {
    const firstCheckIn = rows.length > 0 ? rows[0].local_date : null;
    const charts = {} as NonNullable<typeof long>["charts"];
    for (const m of METRICS) charts[m] = longSummary(rows, me.today, longRange, m, firstCheckIn);
    const { unit, periods } = longSummary(rows, me.today, longRange, "mood", firstCheckIn);
    long = { range: longRange, unit, periodLine: periodLine(periods[0].start, periods[periods.length - 1].end, dateLocaleTag), charts };
  }
  // Days you showed up (1.4 C, showed-up-live): the shown tab's count from the rows already read,
  // which always cover it (the free read starts at the range before; Plus's long reads go further).
  const shownRange = INSIGHTS_TAB_RANGE[longRange ?? range];
  // At 0 days there's no line at all (UX, 18 Nov).
  const shownCount = pageGate("showed-up-live") !== "hidden" ? showedUpShown(rows, me.today)[shownRange] : "hidden";
  const showedUpLine = shownCount === "hidden" ? undefined : { count: shownCount, range: shownRange };
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
        // With 1.3, not with the Plus stack (lifts-live, UX 14 Nov).
        if (pageGate("lifts-live") !== "hidden") lifts = whatLiftsMe(rows, me.today, moreWindow, byDay, CRISIS_KEYWORDS);
      }
    }
    plusMore = <MorePatternsCard window={moreWindow} patterns={morePatterns(rows, me.today, moreWindow, written ?? new Set()).filter((p) => written || p.id !== "writing")} tags={tagLines} lifts={lifts} country={me.profile?.country ?? null} />;
  }
  const help = <GetHelpNow country={me.profile?.country} testId="insights-help" counted neutral icon />;
  return withSegments(
    <InsightsView
      rows={rows}
      today={me.today}
      range={range}
      share={share}
      help={help}
      heading={!available}
      summary={null}
      patterns={withPatterns ? patterns(rows, me.today) : undefined}
      routinePatterns={withPatterns && routineItems ? routineLines(rows, me.today, routineItems) : undefined}
      plusTab={hasPlus ? <PlusTabs current={longRange} /> : undefined}
      plusPatterns={hasPlus ? plusMore : undefined}
      long={long}
      showedUp={showedUpLine}
      yearRow={yearRow}
    />,
    <InsightsHeading share={share} help={help} />,
    true,
  );
}
