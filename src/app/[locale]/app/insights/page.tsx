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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tabMetadata } from "../pageMeta";
import { InsightsView } from "./InsightsView";
import { MorePatternsCard, PlusTabs } from "./PlusInsights";
import { InsightsExample } from "./InsightsExample";
import { GetHelpNow } from "@/components/SafetyCard";
import { readPlusView } from "@/lib/plus/view";
import { isLongRange, longRangeStart, longSummary } from "@/lib/plus/longRange";
import { morePatterns, moreWindowStart } from "@/lib/plus/morePatterns";
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
  const chartsStart = previousRangeStart(me.today, range);
  const patternsStart = patternsWindowStart(me.today);
  const more = pageGate("share-cards-more") !== "hidden";
  const shareOn = pageGate("share-cards") !== "hidden";
  const weekly = pageGate("weekly-report-live") !== "hidden";
  const weekStart = lastWeekStart(me.today);
  const freeStart = [chartsStart, ...(withPatterns ? [patternsStart] : [])].sort()[0];
  // The page's reads all need only `me`, so they start together (the Web Dev's LCP read, 12 Nov:
  // each one in turn cost a round trip to the database). Same reads, same results. Moodbow Plus's
  // view is one of them (decision 246): null when its row can't be read (then nothing about Plus).
  const [checkIns, plus, milestone, stored, requestHeaders] = await Promise.all([
    supabase
      .from("check_ins")
      .select("local_date, mood, sleep_hours, stress, exercise_minutes")
      .gte("local_date", freeStart)
      .lte("local_date", me.today),
    pageGate("plus") !== "hidden" ? readPlusView(supabase, user.id) : null,
    shareOn && more ? loadMilestone(supabase) : undefined,
    weekly && canReflect(me)
      ? supabase.from("ai_reports").select("id, period_start, body, tier, created_at").eq("kind", "weekly").eq("period_start", weekStart).maybeSingle()
      : null,
    headers(),
  ]);
  // With Plus: Year and All time, and More patterns over the last 12 months (or all time on All time).
  // Insights are Plus (spec "Insights become Plus", 14 Nov): without Plus (or with a payment that
  // failed), the labelled example and nothing of theirs. A row that can't be read, or Plus off,
  // shows their own Insights as before (ruling 5). The gate is here and on the route only, never in
  // lib/journal/insights, which the appointment summary uses (ruling 2).
  if (plus && plus.kind !== "plus") return <InsightsExample help={<GetHelpNow country={me.profile?.country} testId="insights-example-help" neutral icon />} />;
  const hasPlus = plus?.kind === "plus";
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
  const dateLocaleTag = dateLocale(locale, requestHeaders.get("accept-language"), me.profile?.country ?? null);
  const share = shareOn ? (
    <ShareMonth
      month={me.today.slice(0, 7)}
      dateLocaleTag={dateLocaleTag}
      chart={more ? { range, moods: series(rows, rangeDays(me.today, range), "mood") } : undefined}
      milestone={more ? milestone : undefined}
      year={pageGate("year-card") !== "hidden" ? yearOnOffer(me.today) : null}
    />
  ) : null;
  // Your week (1.1 D): the last complete week's report, where AI is on for
  // this user and the weekly report is (weekly-report-live). A stored one
  // shows as is; a failed read just means the button. AI available but not
  // turned on by this person: the card explains, with no button (UX); AI
  // off for everyone: no card at all (text = enforcement).
  let week: React.ReactNode = null;
  if (weekly && aiShown(me) && !canReflect(me)) {
    week = <WeeklyReport initial={null} weekStart={weekStart} dateLocaleTag={dateLocaleTag} balance={0} aiOff />;
  } else if (weekly && canReflect(me)) {
    const row = (stored?.data ?? null) as { id: string; period_start: string; body: unknown; tier: string; created_at: string } | null;
    const body = row ? parseReportBody(row.body) : null;
    const initial: Report | null = row && body ? { id: row.id, week_start: row.period_start, body, tier: row.tier === "lite" ? "lite" : "full", created_at: row.created_at } : null;
    week = <WeeklyReport initial={initial} weekStart={weekStart} dateLocaleTag={dateLocaleTag} balance={me.credits?.balance ?? 0} country={me.profile?.country ?? null} />;
  }
  // Your week moved to Today, for everyone (ruling 1): its hard-week help never waits behind Plus.
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
    plusMore = <MorePatternsCard window={moreWindow} patterns={morePatterns(rows, me.today, moreWindow, written ?? new Set()).filter((p) => written || p.id !== "writing")} />;
  }
  return (
    <InsightsView
      rows={rows}
      today={me.today}
      range={range}
      share={share}
      summary={null}
      week={week}
      patterns={withPatterns ? patterns(rows, me.today) : undefined}
      plusTab={hasPlus ? <PlusTabs current={longRange} /> : undefined}
      plusPatterns={hasPlus ? plusMore : undefined}
      long={long}
    />
  );
}
