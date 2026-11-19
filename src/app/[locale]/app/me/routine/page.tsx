import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { BackLink } from "@/components/BackLink";
import { GetHelpNow } from "@/components/SafetyCard";
import { getMe } from "@/lib/journal/me";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { pageGate } from "@/lib/conditions";
import { currentUser } from "@/lib/journal/currentUser";
import { parseRoutineItems, ROUTINE_ITEM_COLUMNS } from "@/lib/journal/routine";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { titledMetadata } from "../../pageMeta";
import { RoutineEditor } from "./RoutineEditor";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me/routine">): Promise<Metadata> {
  const { locale } = await params;
  return titledMetadata((await getTranslations({ locale, namespace: "routine" }))("title"), locale);
}

// Me → Routine (1.4 F, routine-live, board 29). A failed read says so and offers nothing to
// change, so nothing can look saved that isn't.
export default async function RoutinePage({ params }: PageProps<"/[locale]/app/me/routine">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("routine-live") === "hidden") notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const [me, { data, error }] = await Promise.all([getMe(supabase), supabase.from("routine_items").select(ROUTINE_ITEM_COLUMNS).order("position")]);
  const t = await getTranslations("routine");
  const ta = await getTranslations("app");
  const country = me?.profile?.country ?? null;
  return (
    <section className="space-y-6">
      {/* Help first, beside Back (UX's rule: every page with journal content), hidden on paper. */}
      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[8px] print:hidden">
        <BackLink href="/app/me" label={ta("navBackTo", { screen: ta("tabMe") })} testId="nav-back" />
        <GetHelpNow country={country} testId="routine-get-help" counted neutral />
      </div>
      <h1 className={JOURNAL_HEADING} data-testid="routine-title">
        {t("title")}
      </h1>
      <p data-testid="routine-intro" className="text-text">
        {t("intro")}
      </p>
      {error ? <JournalUnavailable /> : <RoutineEditor initial={parseRoutineItems(data)} appointment={pageGate("appointment-live") !== "hidden"} country={country} />}
    </section>
  );
}
