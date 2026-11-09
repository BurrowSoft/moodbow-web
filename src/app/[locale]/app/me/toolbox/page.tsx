import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { BackLink } from "@/components/BackLink";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { pageGate } from "@/lib/conditions";
import { currentUser } from "@/lib/journal/currentUser";
import { parseToolboxItems } from "@/lib/journal/toolbox";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { titledMetadata } from "../../pageMeta";
import { ToolboxBreatheOnly, ToolboxEditor } from "./ToolboxEditor";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me/toolbox">): Promise<Metadata> {
  const { locale } = await params;
  return titledMetadata((await getTranslations({ locale, namespace: "toolbox" }))("meRow"), locale);
}

// Me → Things that help me (1.2, toolbox-live): the person's list, and a minute to breathe.
// A failed read says so and offers nothing to change, so nothing can look saved that isn't;
// breathing needs no data, so it's still there (UX).
export default async function ToolboxPage({ params }: PageProps<"/[locale]/app/me/toolbox">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("toolbox-live") === "hidden") notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const { data, error } = await supabase.from("toolbox_items").select("id, text, position").order("position");
  const t = await getTranslations("toolbox");
  const ta = await getTranslations("app");
  return (
    <section className="space-y-6">
      <BackLink href="/app/me" label={ta("navBackTo", { screen: ta("tabMe") })} testId="nav-back" />
      <h1 className={JOURNAL_HEADING} data-testid="toolbox-title">
        {t("meRow")}
      </h1>
      {error ? (
        <>
          <JournalUnavailable />
          <ToolboxBreatheOnly />
        </>
      ) : (
        <ToolboxEditor initial={parseToolboxItems(data)} />
      )}
    </section>
  );
}
