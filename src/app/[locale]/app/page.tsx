import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { currentUser } from "@/lib/journal/currentUser";
import type { CheckIn } from "@/lib/journal/checkIn";
import { getMe } from "@/lib/journal/me";
import { dateLine, dateLocale, greetingKey, localHour } from "@/lib/journal/today";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CheckInCard } from "./CheckInCard";
import { EntryPreviews, type EntrySummary } from "./EntryPreviews";
import { tabMetadata } from "./pageMeta";
import { Link } from "@/i18n/navigation";
import { pageGate } from "@/lib/conditions";
import type { InsightRow } from "@/lib/journal/insights";
import { lastWeekStart } from "@/lib/journal/report";
import { sixDaysAfter, yourWeek, type YourWeekMoment } from "@/lib/journal/yourWeek";
import { YourWeekCard } from "./insights/YourWeekCard";
import { SecurityNoticeRead } from "./SecurityNoticeRead";
import { JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { isLowMood } from "@/lib/journal/checkInSaved";
import { readPlusPage } from "@/lib/plus/page";
import { flagsCrisis } from "@/lib/safety/crisis";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { SetupLaterCard, TodayPlusCard } from "./TodayCards";
import { readCardTags } from "@/lib/journal/tagsData";

// A stuck request ends here at the latest (UX, the timeout audit); each
// data call gives up after 15 s on its own (lib/supabase/deadline).
export const maxDuration = 30;

export async function generateMetadata({ params }: PageProps<"/[locale]/app">): Promise<Metadata> {
  return tabMetadata("tabToday", (await params).locale);
}

// Today (M4): greeting + date line in the profile's time zone, today's
// check-in, "Write about your day" and today's entries. "Today" is
// get_me().today (the user's local date from the database), never the
// browser's or the server's clock. The layout has already checked the
// session, consents and onboarding.
export default async function TodayPage({ params }: PageProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;

  // Today's reads all need only `me`, so they start together (the Web Dev's LCP read, 12 Nov: each
  // one in turn cost a round trip to the database). Same reads, same results.
  // The milestone card moved to the top of Timeline's list (Vitor, 14 Nov).
  const [checkIn, todaysEntries, requestHeaders] = await Promise.all([
    supabase.from("check_ins").select("local_date, mood, sleep_hours, sleep_quality, exercise_minutes, stress, updated_at").eq("local_date", me.today).maybeSingle(),
    // Today's entries, newest first (previews only; the editor loads the rest).
    supabase.from("entries").select("id, body, is_moment, entry_date, created_at").eq("entry_date", me.today).order("created_at", { ascending: false }),
    headers(),
  ]);
  const { data, error: checkInError } = checkIn;
  const { data: entries, error: entriesError } = todaysEntries;
  // Today always keeps check-in and Write, with errors beside them (specs/next-release.md).
  // A failed read shows the empty card with its error: saving it can't overwrite anything,
  // as a save with no known version is insert-only, and a check-in already there opens the
  // conflict dialog. Not reachable here: no session, or no get_me, as that spec says.
  // The key: the card reads `initial` only when it mounts, so a Try again that brings the real
  // row needs a new card. Unsaved choices stay, in CheckInDraft.
  const t = await getTranslations("today");
  const te = await getTranslations("entry");
  const timeZone = me.profile?.time_zone ?? "UTC";
  const dateLocaleTag = dateLocale(locale, requestHeaders.get("accept-language"), me.profile?.country ?? null);
  // Today's Plus card on first landing (1.3 §6 and the rulings): only for someone without Plus (never
  // with Plus, never past due), only when today's rows were read, and never on a day when anything
  // saved was flagged or was one of the two lowest faces. Help is always above it on the page.
  const plusPage = pageGate("plus") !== "hidden" ? await readPlusPage(supabase, user.id, me.profile?.country, locale) : null;
  const plus = plusPage?.view ?? null;
  // Your week, for everyone (Insights become Plus, ruling 1): its hard-week help is never behind
  // Plus. Today's own read of last week's check-ins (a mood counts) and moments (id and date only).
  // A failed read: no card. The app shows the same card above Write (Mobile Dev).
  let yourWeekCard: React.ReactNode = null;
  let hardWeek = false;
  if (pageGate("your-week-live") !== "hidden") {
    const start = lastWeekStart(me.today);
    const end = sixDaysAfter(start);
    const [weekRead, momentsRead] = await Promise.all([
      supabase.from("check_ins").select("local_date, mood, sleep_hours, stress, exercise_minutes").gte("local_date", start).lte("local_date", end),
      supabase.from("entries").select("id, entry_date").eq("is_moment", true).gte("entry_date", start).lte("entry_date", end),
    ]);
    const week = weekRead.error ? null : yourWeek((weekRead.data ?? []) as InsightRow[], me.today, (momentsRead.data ?? []) as YourWeekMoment[]);
    hardWeek = week?.kind === "hard";
    if (week) yourWeekCard = <YourWeekCard week={week} country={me.profile?.country} dateLocaleTag={dateLocaleTag} />;
  }
  const flaggedToday = (entries ?? []).some((e) => flagsCrisis(String((e as { body?: unknown }).body ?? ""), CRISIS_KEYWORDS));
  // Never under a hard week's help either (the rule Your week brought with it).
  const plusCard = plus?.kind === "free" && !hardWeek && !checkInError && !entriesError && !flaggedToday && !isLowMood((data as CheckIn | null)?.mood) ? plus : null;
  // Setup after first use (1.3 §6): offered once there's a check-in, while the reminder is still off.
  const setupLater = Boolean(data) && me.settings?.reminder_on === false;

  // Tags on the check-in (tags-live): the day's and the person's recent ones.
  const cardTags = await readCardTags(supabase, me.today);

  return (
    <section className="space-y-8">
      <Suspense fallback={null}>
        <SecurityNoticeRead supabase={supabase} uid={user.id} />
      </Suspense>
      <header>
        {/* Focusable from code only: where focus goes when the milestone card is dismissed. */}
        <h1 id="today-title" tabIndex={-1} className={`${JOURNAL_HEADING} focus:outline-none`} data-testid="today-greeting">
          {t(greetingKey(localHour(timeZone)))}
        </h1>
        {/* Large text on a narrow screen: the date stops growing at about 200 %, as the help
            buttons do (decision 231), so Write below it is in the first view (Web Tester, #282). */}
        <p className="mt-1 text-muted max-[16em]:[font-size:min(1rem,max(10vw,32px))]" data-testid="today-date">
          {dateLine(me.today, dateLocaleTag)}
        </p>
        {/* Large text on a narrow screen (UX, 2026-11-12): the check-in card runs to ~1,400 px at
            320 px / 300 %, so Write is also offered here, in the first view. CSS only: em in a media
            query is the reader's own text size, so at 100 % this never shows, and nothing moves after
            load or depends on scripts. The card and the Write button below stay as they are. */}
        <Link
          href="/app/write"
          data-testid="today-write-top"
          className="mt-[8px] hidden min-h-[44px] max-w-full items-center font-medium text-accent underline underline-offset-4 [font-size:min(1rem,max(10vw,32px))] [overflow-wrap:anywhere] max-[16em]:inline-flex"
        >
          {te("writeButton")}
        </Link>
      </header>
      <CheckInCard key={checkInError ? "unread" : "read"} initial={(data as CheckIn | null) ?? null} uid={user.id} date={me.today} dateLocaleTag={dateLocaleTag} keepDraft loadFailed={Boolean(checkInError)} {...cardTags} country={me.profile?.country} />
      {/* Today's order (UX ruling 3): the check-in, the cards (Your week first: its hard-week help), the
          entries, then Write last. */}
      {yourWeekCard}
      {plusCard && plusPage && <TodayPlusCard trial={plusCard.trial} price={plusPage.price} offer={plusPage.offer} date={me.today} />}
      {setupLater && <SetupLaterCard />}
      {entriesError && (
        <p role="alert" data-testid="today-entries-error" className="font-medium text-accent">
          {t("errGeneric")}
        </p>
      )}
      {entries && entries.length > 0 && (
        <section aria-labelledby="today-entries-title">
          <h2 id="today-entries-title" className="text-lg font-medium text-text">
            {te("todayEntriesTitle")}
          </h2>
          <EntryPreviews entries={entries as EntrySummary[]} testIdPrefix="today-entry" from="/app" timeZone={me.profile?.time_zone ?? "UTC"} dateLocaleTag={dateLocaleTag} />
        </section>
      )}
      <Link
        href="/app/write"
        data-testid="today-write"
        className="inline-flex min-h-12 max-w-full items-center justify-center rounded-full bg-accent px-8 text-center font-medium text-on-accent hover:bg-accent-hover"
      >
        {te("writeButton")}
      </Link>
    </section>
  );
}
