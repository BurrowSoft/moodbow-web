import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import type { CheckIn } from "@/lib/journal/checkIn";
import { getMe } from "@/lib/journal/me";
import { dateLine, dateLocale, greetingKey, localHour } from "@/lib/journal/today";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CheckInCard } from "./CheckInCard";
import { EntryPreviews, type EntrySummary } from "./EntryPreviews";
import { tabMetadata } from "./pageMeta";
import { Link } from "@/i18n/navigation";
import { pageGate } from "@/lib/conditions";
import { loadMilestone } from "@/lib/share/milestoneData";
import { MilestoneCard } from "./MilestoneCard";

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
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;

  const { data, error: checkInError } = await supabase
    .from("check_ins")
    .select("local_date, mood, sleep_hours, sleep_quality, exercise_minutes, stress, updated_at")
    .eq("local_date", me.today)
    .maybeSingle();
  // A failed read must not look like "no check-in yet": the empty card would
  // then save over the real one without a lock.
  if (checkInError) return <JournalUnavailable />;
  // Today's entries, newest first (previews only; the editor loads the rest).
  const { data: entries, error: entriesError } = await supabase
    .from("entries")
    .select("id, body, is_moment, entry_date, created_at")
    .eq("entry_date", me.today)
    .order("created_at", { ascending: false });
  const t = await getTranslations("today");
  const te = await getTranslations("entry");
  const timeZone = me.profile?.time_zone ?? "UTC";
  const dateLocaleTag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);
  // A milestone reached (decision 169): offered once, where the 1.1 share cards are on.
  const milestone = pageGate("share-cards") !== "hidden" && pageGate("share-cards-more") !== "hidden" ? await loadMilestone(supabase) : null;

  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-3xl font-medium tracking-tight" data-testid="today-greeting">
          {t(greetingKey(localHour(timeZone)))}
        </h1>
        <p className="mt-1 text-muted" data-testid="today-date">
          {dateLine(me.today, dateLocaleTag)}
        </p>
      </header>
      <CheckInCard initial={(data as CheckIn | null) ?? null} uid={user.id} date={me.today} dateLocaleTag={dateLocaleTag} />
      <Link
        href="/app/write"
        data-testid="today-write"
        className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-8 font-medium text-on-accent hover:opacity-90"
      >
        {te("writeButton")}
      </Link>
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
      {/* Last on the page: it floats above the tab bar (decision 186), and its
          spacer is the page's end, so its late arrival moves nothing. */}
      {milestone && <MilestoneCard n={milestone.n} colours={milestone.colours} uid={user.id} month={me.today.slice(0, 7)} dateLocaleTag={dateLocaleTag} />}
    </section>
  );
}
