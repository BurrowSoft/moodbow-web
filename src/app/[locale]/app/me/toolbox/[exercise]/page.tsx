import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { BackLink } from "@/components/BackLink";
import { GetHelpNow } from "@/components/SafetyCard";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { pageGate } from "@/lib/conditions";
import { currentUser } from "@/lib/journal/currentUser";
import { isGroundingExercise, nameItMoods, type GroundingExercise } from "@/lib/journal/grounding";
import { getMe } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { titledMetadata } from "../../../pageMeta";
import { BodyScan, FiveSenses, NameIt } from "../Grounding";

const TITLE = { "5-4-3-2-1": "groundingSenses", "body-scan": "groundingBodyScan", "name-it": "groundingNameIt" } as const satisfies Record<GroundingExercise, string>;

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me/toolbox/[exercise]">): Promise<Metadata> {
  const { locale, exercise } = await params;
  const t = await getTranslations({ locale, namespace: "toolbox" });
  return titledMetadata(isGroundingExercise(exercise) ? t(TITLE[exercise]) : t("meRow"), locale);
}

// Grounding (1.3, grounding-live with toolbox-live): one page each, Back to the list and the quiet
// Get help now beside it on every screen, the close included (Ruling 1), hidden on paper.
export default async function GroundingPage({ params }: PageProps<"/[locale]/app/me/toolbox/[exercise]">) {
  const { locale, exercise } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("toolbox-live") === "hidden" || pageGate("grounding-live") === "hidden" || !isGroundingExercise(exercise)) notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  // Name it: the moods this person has used (only the fixed words, Ruling 2). A failed read
  // offers the whole list: the screen needs no data to work.
  const [me, moods] = await Promise.all([
    getMe(supabase),
    exercise === "name-it" ? supabase.from("check_ins").select("mood").order("local_date", { ascending: false }).limit(366).then(({ data, error }) => nameItMoods(error ? null : data)) : null,
  ]);
  const t = await getTranslations("toolbox");
  const ta = await getTranslations("app");
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-[12px] gap-y-[8px] print:hidden">
        <BackLink href="/app/me/toolbox" label={ta("navBackTo", { screen: t("meRow") })} testId="nav-back" />
        <GetHelpNow country={me?.profile?.country} testId="grounding-get-help" neutral icon />
      </div>
      <h1 className={JOURNAL_HEADING} data-testid="grounding-title">
        {t(TITLE[exercise])}
      </h1>
      {exercise === "5-4-3-2-1" && <FiveSenses />}
      {exercise === "body-scan" && <BodyScan />}
      {exercise === "name-it" && <NameIt moods={moods ?? nameItMoods(null)} />}
    </section>
  );
}
