import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { pageGate } from "@/lib/conditions";
import { yearOnOffer } from "@/lib/share/year";
import { getMe } from "@/lib/journal/me";
import { dateLocale } from "@/lib/journal/today";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tabMetadata } from "../pageMeta";
import { loadTimeline } from "./actions";
import { segment } from "@/lib/ui/journalLayout";
import { TimelineList } from "./TimelineList";
import { OnThisDay } from "./OnThisDay";
import { MonthCalendar } from "./MonthCalendar";
import { TimelineViews } from "./TimelineViews";
import { loadCalendarMonth } from "./calendarActions";
import { monthOf } from "@/lib/journal/calendar";
import { parseView, VIEW_COOKIE } from "@/lib/journal/timelineView";
import { onThisDayDates, pickOnThisDay, type MomentRow, type OnThisDayKind } from "@/lib/journal/onThisDay";
import { preview } from "@/lib/journal/entry";
import { dateLine } from "@/lib/journal/today";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/timeline">): Promise<Metadata> {
  return tabMetadata("tabTimeline", (await params).locale);
}

// Timeline (M5): All days, or Moments (?view=moments). The Moments filter
// needs get_timeline's p_moments_only (moodbow-app migration 005): it shows
// on Previews (staging has 005) and on Production once "timeline-moments-rpc"
// is met (005 applied there too).
export default async function TimelinePage({ params, searchParams }: PageProps<"/[locale]/app/timeline">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;

  const momentsReady = pageGate("timeline-moments-rpc") !== "hidden";
  const momentsOnly = momentsReady && (await searchParams).view === "moments";
  const page = await loadTimeline(null, momentsOnly);
  if (page.status === "error") return <JournalUnavailable />;

  const t = await getTranslations("timeline");
  const dateLocaleTag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);

  // On this day (1.1 A): a moment from a month, 6 months or a year ago today
  // (the profile's today), never a crisis-flagged one. A failed read just
  // means no card.
  let onThisDay: { kind: OnThisDayKind; entry: MomentRow; mood: number | null } | null = null;
  if (pageGate("on-this-day-live") !== "hidden") {
    const dates = onThisDayDates(me.today).map((d) => d.date);
    const { data: moments } = await supabase.from("entries").select("id, entry_date, body, is_moment, created_at").eq("is_moment", true).in("entry_date", dates);
    const picked = pickOnThisDay((moments ?? []) as MomentRow[], me.today, CRISIS_KEYWORDS);
    if (picked) {
      const { data: checkIn } = await supabase.from("check_ins").select("mood").eq("local_date", picked.entry.entry_date).maybeSingle();
      onThisDay = { ...picked, mood: (checkIn as { mood: number } | null)?.mood ?? null };
    }
  }
  const filter = segment;
  const shareable = pageGate("share-cards") !== "hidden";
  const printable = pageGate("print-live") !== "hidden";

  // Month calendar (1.1 M): List · Calendar, the choice from its cookie so
  // the chosen view paints first; this month is read here only for the
  // calendar (it draws at once). On this day stays above both.
  const calendarLive = pageGate("calendar-live") !== "hidden";
  const view = calendarLive ? parseView((await cookies()).get(VIEW_COOKIE)?.value) : "list";
  const calendarInitial = view === "calendar" ? await loadCalendarMonth(monthOf(me.today)) : null;

  const onThisDayCard = onThisDay && (
    <OnThisDay
      kind={onThisDay.kind}
      entryId={onThisDay.entry.id}
      dateLabel={dateLine(onThisDay.entry.entry_date, dateLocaleTag)}
      preview={preview(onThisDay.entry.body)}
      mood={onThisDay.mood}
      uid={user.id}
      today={me.today}
    />
  );
  const list = (
    <>
      {momentsReady && (
        <nav aria-label={t("timelineTitle")} className="mt-4 flex gap-2">
          <Link href="/app/timeline" data-testid="timeline-filter-all" aria-current={!momentsOnly ? "page" : undefined} className={filter(!momentsOnly)}>
            {t("timelineAll")}
          </Link>
          <Link
            href="/app/timeline?view=moments"
            data-testid="timeline-filter-moments"
            aria-current={momentsOnly ? "page" : undefined}
            className={filter(momentsOnly)}
          >
            {t("timelineMoments")}
          </Link>
        </nav>
      )}
      {!calendarLive && onThisDayCard}
      {/* Keyed by the view, so switching filters starts a fresh list. */}
      <TimelineList
        key={momentsOnly ? "moments" : "all"}
        initial={page.days}
        initialDone={page.done}
        momentsOnly={momentsOnly}
        dateLocaleTag={dateLocaleTag}
        shareable={shareable}
        year={pageGate("year-card") !== "hidden" ? yearOnOffer(me.today) : null}
        printable={printable}
      />
    </>
  );

  return (
    <section>
      {/* Focusable from code only: where focus goes when On this day is hidden. */}
      <h1 id="timeline-title" tabIndex={-1} className="text-3xl font-medium tracking-tight focus:outline-none">
        {t("timelineTitle")}
      </h1>
      {calendarLive ? (
        <>
          {onThisDayCard}
          <TimelineViews
            initialView={view}
            list={list}
            calendar={
              <MonthCalendar today={me.today} dateLocaleTag={dateLocaleTag} initial={calendarInitial?.status === "ok" ? calendarInitial.days : null} shareable={shareable} printable={printable} />
            }
          />
        </>
      ) : (
        list
      )}
    </section>
  );
}
