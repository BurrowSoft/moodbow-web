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
import { tabMetadata } from "./TabPlaceholder";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({ params }: PageProps<"/[locale]/app">): Promise<Metadata> {
  return tabMetadata("tabToday", (await params).locale);
}

// Today (M4): greeting + date line in the profile's time zone, today's
// check-in, "Write about your day" and today's entries. "Today" is get_me().today (the user's local date from
// the database), never the browser's or the server's clock. The layout has
// already checked the session, consents and onboarding.
export default async function TodayPage({ params }: PageProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const me = supabase ? await getMe(supabase) : null;
  if (!supabase || !user || !me) return <JournalUnavailable />;

  const { data } = await supabase
    .from("check_ins")
    .select("local_date, mood, sleep_hours, sleep_quality, exercise_minutes, stress, updated_at")
    .eq("local_date", me.today)
    .maybeSingle();
  // Today's entries, newest first (previews only; the editor loads the rest).
  const { data: entries } = await supabase
    .from("entries")
    .select("id, body")
    .eq("entry_date", me.today)
    .order("created_at", { ascending: false });
  const t = await getTranslations("today");
  const te = await getTranslations("entry");
  const timeZone = me.profile?.time_zone ?? "UTC";
  const dateLocaleTag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);

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
      <CheckInCard initial={(data as CheckIn | null) ?? null} uid={user.id} today={me.today} dateLocaleTag={dateLocaleTag} />
      <Link
        href="/app/write"
        data-testid="today-write"
        className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-8 font-medium text-on-accent hover:opacity-90"
      >
        {te("writeButton")}
      </Link>
      {entries && entries.length > 0 && (
        <section aria-labelledby="today-entries-title">
          <h2 id="today-entries-title" className="text-lg font-medium text-text">
            {te("todayEntriesTitle")}
          </h2>
          <ul className="mt-3 space-y-3">
            {(entries as { id: string; body: string }[]).map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/app/entries/${entry.id}`}
                  data-testid={`today-entry-${entry.id}`}
                  className="block rounded-2xl border border-border bg-surface p-4 text-text hover:bg-pill"
                >
                  <span className="line-clamp-3 whitespace-pre-line">{entry.body.slice(0, 240)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
