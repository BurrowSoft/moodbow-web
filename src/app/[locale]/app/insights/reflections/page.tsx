import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { BackLink } from "@/components/BackLink";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { GetHelpNow } from "@/components/SafetyCard";
import { SessionEnded } from "@/components/SessionEnded";
import { Link, redirect } from "@/i18n/navigation";
import { aiShown, canReflect } from "@/lib/journal/ai";
import { currentUser } from "@/lib/journal/currentUser";
import { getMe } from "@/lib/journal/me";
import { ALL_REFLECTIONS, INSIGHTS_AI } from "@/lib/journal/origin";
import { readReflections, REFLECTIONS_MAX, REFLECTIONS_PAGE, shownOf } from "@/lib/journal/reflections";
import { dateLocale } from "@/lib/journal/today";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JOURNAL_CARD, JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { insightsMetadata } from "../../pageMeta";
import { insightsName } from "@/lib/journal/insightsName";
import { ReflectionList } from "../AiPane";
import { FocusFirstNew } from "./FocusFirstNew";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/insights/reflections">): Promise<Metadata> {
  return insightsMetadata((await params).locale);
}

// See all (Insights → AI, decision 258): every reflection, newest first, 20 at a time. Show more is a
// link (?shown=40), so it works without scripts, and it lands on the first row it added. Only where
// AI is on for this person; else back to Insights, where AI not available means no word of AI and AI
// off means the AI segment's invitation.
export default async function ReflectionsPage({ params, searchParams }: PageProps<"/[locale]/app/insights/reflections">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;
  if (!aiShown(me)) return redirect({ href: "/app/insights", locale });
  if (!canReflect(me)) return redirect({ href: INSIGHTS_AI, locale });
  const shown = shownOf((await searchParams).shown);
  const [read, requestHeaders] = await Promise.all([readReflections(supabase, shown).catch(() => null), headers()]);
  const t = await getTranslations("ai");
  const ta = await getTranslations("app");
  const tag = dateLocale(locale, requestHeaders.get("accept-language"), me.profile?.country ?? null);
  return (
    <section className="space-y-6">
      {/* Help first, beside Back (every page with journal content). */}
      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[8px]">
        <BackLink href={INSIGHTS_AI} label={ta("navBackTo", { screen: ta(insightsName(aiShown(me)).spoken) })} testId="nav-back" />
        <GetHelpNow country={me.profile?.country} testId="reflections-get-help" counted neutral />
      </div>
      <h1 className={JOURNAL_HEADING} data-testid="reflections-title">
        {t("reflectionsTitle")}
      </h1>
      {read === null ? (
        <JournalUnavailable />
      ) : read.rows.length === 0 ? (
        <p data-testid="reflections-empty" className="text-muted">
          {t("reflectionsEmpty")}
        </p>
      ) : (
        <div className={JOURNAL_CARD}>
          <ReflectionList rows={read.rows} dateLocaleTag={tag} origin={ALL_REFLECTIONS} crisisWord={t("reflectionsRowCrisis")} topRule={false} />
        </div>
      )}
      {read?.more && shown < REFLECTIONS_MAX && (
        <p className="flex justify-center">
          <Link href={`${ALL_REFLECTIONS}?shown=${shown + REFLECTIONS_PAGE}#reflection-${read.rows.length}`} data-testid="reflections-show-more" className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4">
            {t("reflectionsShowMore")}
          </Link>
        </p>
      )}
      <FocusFirstNew shown={shown} />
    </section>
  );
}
