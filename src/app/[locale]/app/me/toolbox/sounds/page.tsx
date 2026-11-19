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
import { getMe } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { titledMetadata } from "../../../pageMeta";
import { CalmingSounds } from "./CalmingSounds";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me/toolbox/sounds">): Promise<Metadata> {
  const { locale } = await params;
  return titledMetadata((await getTranslations({ locale, namespace: "sounds" }))("title"), locale);
}

// Me → Things that help me → Calming sounds (1.4 B, sounds-live with toolbox-live): Back to the
// list and the quiet Get help now beside it, as grounding. It reads nothing of the journal: the
// person is only needed for sign-out to stop the sound.
export default async function SoundsPage({ params }: PageProps<"/[locale]/app/me/toolbox/sounds">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("toolbox-live") === "hidden" || pageGate("sounds-live") === "hidden") notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  const t = await getTranslations("sounds");
  const tb = await getTranslations("toolbox");
  const ta = await getTranslations("app");
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-[12px] gap-y-[8px] print:hidden">
        <BackLink href="/app/me/toolbox" label={ta("navBackTo", { screen: tb("meRow") })} testId="nav-back" />
        <GetHelpNow country={me?.profile?.country} testId="sounds-get-help" counted neutral icon />
      </div>
      <h1 className={JOURNAL_HEADING} data-testid="sounds-title">
        {t("title")}
      </h1>
      <p data-testid="sounds-intro" className="text-text">
        {t("intro")}
      </p>
      <CalmingSounds uid={user.id} />
    </section>
  );
}
