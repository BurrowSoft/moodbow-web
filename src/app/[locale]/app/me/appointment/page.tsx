import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { BackLink } from "@/components/BackLink";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { pageGate } from "@/lib/conditions";
import { starredIn, weeksDays } from "@/lib/journal/appointment";
import { currentUser } from "@/lib/journal/currentUser";
import type { InsightRow } from "@/lib/journal/insights";
import { getMe } from "@/lib/journal/me";
import { dateLine, dateLocale } from "@/lib/journal/today";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { titledMetadata } from "../../pageMeta";
import { AppointmentSummary } from "./AppointmentSummary";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me/appointment">): Promise<Metadata> {
  const { locale } = await params;
  return titledMetadata((await getTranslations({ locale, namespace: "appointment" }))("meRow"), locale);
}

// Me → For my appointment (1.2, appointment-live): the last 12 weeks' check-ins and starred
// entries, the most any range shows. Nothing else is read: never letters, the safety plan,
// the toolbox, Bo or anything AI (content/appointment.json's neverIncluded). Dates are
// written here, on the server, so the page shows the same words before and after it loads.
export default async function AppointmentPage({ params }: PageProps<"/[locale]/app/me/appointment">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("appointment-live") === "hidden") notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;
  const days = weeksDays(me.today, 12);
  const [checkIns, moments] = await Promise.all([
    supabase.from("check_ins").select("local_date, mood, sleep_hours, stress, exercise_minutes").gte("local_date", days[0]).lte("local_date", me.today),
    supabase.from("entries").select("id, entry_date, body").eq("is_moment", true).gte("entry_date", days[0]).lte("entry_date", me.today),
  ]);
  const t = await getTranslations("appointment");
  const ta = await getTranslations("app");
  const tag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);
  const starred = starredIn(moments.data, days);
  const dateLabels = Object.fromEntries(starred.map((e) => [e.entry_date, dateLine(e.entry_date, tag)]));
  return (
    <section className="space-y-6">
      <div className="print:hidden">
        <BackLink href="/app/me" label={ta("navBackTo", { screen: ta("tabMe") })} testId="nav-back" />
      </div>
      <h1 className={JOURNAL_HEADING} data-testid="appointment-title">
        {t("meRow")}
      </h1>
      {checkIns.error || moments.error ? <JournalUnavailable /> : <AppointmentSummary today={me.today} rows={(checkIns.data ?? []) as InsightRow[]} starred={starred} dateLabels={dateLabels} />}
    </section>
  );
}
