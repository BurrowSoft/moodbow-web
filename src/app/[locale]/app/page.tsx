import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import type { CheckIn } from "@/lib/journal/checkIn";
import { getMe } from "@/lib/journal/me";
import { dateLine, greetingKey, localHour } from "@/lib/journal/today";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CheckInCard } from "./CheckInCard";
import { tabMetadata } from "./TabPlaceholder";

export async function generateMetadata({ params }: PageProps<"/[locale]/app">): Promise<Metadata> {
  return tabMetadata("tabToday", (await params).locale);
}

// Today (M4, part A): greeting + date line in the profile's time zone, and
// today's check-in. "Today" is get_me().today (the user's local date from
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
  const t = await getTranslations("today");
  const timeZone = me.profile?.time_zone ?? "UTC";

  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-3xl font-medium tracking-tight" data-testid="today-greeting">
          {t(greetingKey(localHour(timeZone)))}
        </h1>
        <p className="mt-1 text-muted" data-testid="today-date">
          {dateLine(me.today, locale)}
        </p>
      </header>
      <CheckInCard initial={(data as CheckIn | null) ?? null} uid={user.id} today={me.today} />
    </section>
  );
}
