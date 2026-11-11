import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { BackLink } from "@/components/BackLink";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { pageGate } from "@/lib/conditions";
import { currentUser } from "@/lib/journal/currentUser";
import { forClient, parseLetterRows } from "@/lib/journal/letters";
import { getMe } from "@/lib/journal/me";
import { dateLocale } from "@/lib/journal/today";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { titledMetadata } from "../../pageMeta";
import { LettersEditor } from "./LettersEditor";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me/letters">): Promise<Metadata> {
  const { locale } = await params;
  return titledMetadata((await getTranslations({ locale, namespace: "letters" }))("meRow"), locale);
}

// Me → Letters to future me (1.2, letters-live): write one, and the list. A locked letter's
// text stays here on the server (forClient); it's sent only when the person opens it.
export default async function LettersPage({ params }: PageProps<"/[locale]/app/me/letters">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("letters-live") === "hidden") notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const [me, { data, error }] = await Promise.all([getMe(supabase), supabase.from("letters").select("id, body, written_on, opens_on, card_from, opened_at")]);
  const t = await getTranslations("letters");
  const ta = await getTranslations("app");
  const tag = dateLocale(locale, (await headers()).get("accept-language"), me?.profile?.country ?? null);
  return (
    <section className="space-y-6">
      <BackLink href="/app/me" label={ta("navBackTo", { screen: ta("tabMe") })} testId="nav-back" />
      <h1 className={JOURNAL_HEADING} data-testid="letters-title">
        {t("meRow")}
      </h1>
      {error || !me ? <JournalUnavailable /> : <LettersEditor initial={parseLetterRows(data).map(forClient)} dateLocaleTag={tag} country={me.profile?.country} today={me.today} />}
    </section>
  );
}
