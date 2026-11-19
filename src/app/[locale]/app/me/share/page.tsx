import type { Metadata } from "next";
import { headers } from "next/headers";
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
import { dateLocale } from "@/lib/journal/today";
import { parseShareLinks, SHARE_LINK_COLUMNS } from "@/lib/share/shareLinks";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { titledMetadata } from "../../pageMeta";
import { ShareMe, type RoutineChoice } from "./ShareMe";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me/share">): Promise<Metadata> {
  const { locale } = await params;
  return titledMetadata((await getTranslations({ locale, namespace: "shareMe" }))("title"), locale);
}

// Me → Share your week (1.4 G, trusted-share-live): the person's links and a new one. The person's
// own rows through RLS (040's granted columns, never the token hash) and their Routine items for the
// options. A failed read says so and offers nothing to change. Help beside Back, as everywhere.
export default async function SharePage({ params }: PageProps<"/[locale]/app/me/share">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("trusted-share-live") === "hidden") notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const [me, links, routine, requestHeaders] = await Promise.all([
    getMe(supabase),
    supabase.from("share_links").select(SHARE_LINK_COLUMNS),
    supabase.from("routine_items").select("id, name, position, in_appointment").order("position"),
    headers(),
  ]);
  const t = await getTranslations("shareMe");
  const ta = await getTranslations("app");
  const choices: RoutineChoice[] = routine.error
    ? []
    : ((routine.data ?? []) as { id?: unknown; name?: unknown; in_appointment?: unknown }[])
        .filter((r) => typeof r.id === "string" && typeof r.name === "string")
        .map((r) => ({ id: r.id as string, name: r.name as string, inAppointment: r.in_appointment === true }));
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[8px]">
        <BackLink href="/app/me" label={ta("navBackTo", { screen: ta("tabMe") })} testId="nav-back" />
        <GetHelpNow country={me?.profile?.country} testId="share-get-help" counted neutral />
      </div>
      <h1 className={JOURNAL_HEADING} data-testid="share-title">
        {t("title")}
      </h1>
      {links.error ? <JournalUnavailable /> : <ShareMe initialLinks={parseShareLinks(links.data)} routine={choices} dateLocaleTag={dateLocale(locale, requestHeaders.get("accept-language"), me?.profile?.country ?? null)} />}
    </section>
  );
}
