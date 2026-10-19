import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import type { CheckIn } from "@/lib/journal/checkIn";
import { getMe } from "@/lib/journal/me";
import { isIsoDate } from "@/lib/journal/timeline";
import { withOrigin } from "@/lib/journal/origin";
import { BackLink } from "@/components/BackLink";
import { backLabel } from "@/lib/journal/backLabel";
import { dateLine, dateLocale } from "@/lib/journal/today";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EntryPreviews, type EntrySummary } from "../../EntryPreviews";
import { tabMetadata, titledMetadata } from "../../TabPlaceholder";
import { DayCheckIn } from "./DayCheckIn";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/timeline/[date]">): Promise<Metadata> {
  // The day's date (in the browser language's format; the profile's
  // region would need another get_me() here), else Timeline.
  const { locale, date } = await params;
  if (!isIsoDate(date)) return tabMetadata("tabTimeline", locale);
  return titledMetadata(dateLine(date, dateLocale(locale, (await headers()).get("accept-language"), null)), locale);
}

// One day (M5): its check-in (editable, or "Add a check-in") and all its
// entries, each opening the editor, plus "Add an entry" for that day. Only
// today and earlier: a future date is a 404, like a malformed one.
export default async function DayPage({ params }: PageProps<"/[locale]/app/timeline/[date]">) {
  const { locale, date } = await params;
  setRequestLocale(locale as Locale);
  if (!isIsoDate(date)) notFound();
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;
  if (date > me.today) notFound();

  const { data: checkIn, error: checkInError } = await supabase
    .from("check_ins")
    .select("local_date, mood, sleep_hours, sleep_quality, exercise_minutes, stress, updated_at")
    .eq("local_date", date)
    .maybeSingle();
  // A failed read must not look like "no check-in this day" (see Today).
  if (checkInError) return <JournalUnavailable />;
  const { data: entries, error: entriesError } = await supabase
    .from("entries")
    .select("id, body, is_moment, created_at")
    .eq("entry_date", date)
    .order("created_at", { ascending: false });

  const t = await getTranslations("timeline");
  const tt = await getTranslations("today");
  const dateLocaleTag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);

  return (
    <section className="space-y-8">
      {/* Opened from the Timeline (decision 152). */}
      <BackLink href="/app/timeline" label={await backLabel("/app/timeline", dateLocaleTag)} testId="nav-back" />
      <h1 className="text-3xl font-medium tracking-tight" data-testid="day-date">
        {dateLine(date, dateLocaleTag)}
      </h1>
      <DayCheckIn initial={(checkIn as CheckIn | null) ?? null} uid={user.id} date={date} dateLocaleTag={dateLocaleTag} />
      {entriesError ? (
        <p role="alert" data-testid="day-entries-error" className="font-medium text-accent">
          {tt("errGeneric")}
        </p>
      ) : (
        entries && entries.length > 0 && <EntryPreviews entries={entries as EntrySummary[]} testIdPrefix="day-entry" from={`/app/timeline/${date}`} timeZone={me.profile?.time_zone ?? "UTC"} dateLocaleTag={dateLocaleTag} />
      )}
      <Link
        href={withOrigin(`/app/write?date=${date}`, `/app/timeline/${date}`)}
        data-testid="day-add-entry"
        className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-8 font-medium text-on-accent hover:opacity-90"
      >
        {t("dayAddEntry")}
      </Link>
    </section>
  );
}
