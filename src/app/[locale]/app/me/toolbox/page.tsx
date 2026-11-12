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
import { readPlusView } from "@/lib/plus/view";
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
  const [me, { data, error }, plus] = await Promise.all([
    getMe(supabase),
    supabase.from("toolbox_items").select("id, text, position").order("position"),
    // The other ways to breathe are Plus's; without it (or unreadable) it's today's only, and
    // the toolbox, a help surface, never shows a lock (UX, 12 Nov).
    pageGate("plus") !== "hidden" ? readPlusView(supabase, user.id) : Promise.resolve(null),
  ]);
  const hasPlus = plus?.kind === "plus";
  const t = await getTranslations("toolbox");
  const ta = await getTranslations("app");
  return (
    <section className="space-y-6">
      {/* Help first, beside Back (UX's rule: every page with journal content), hidden on paper. */}
      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[8px] print:hidden">
        <BackLink href="/app/me" label={ta("navBackTo", { screen: ta("tabMe") })} testId="nav-back" />
        <GetHelpNow country={me?.profile?.country} testId="toolbox-get-help" neutral />
      </div>
      <h1 className={JOURNAL_HEADING} data-testid="toolbox-title">
        {t("meRow")}
      </h1>
      {error ? (
        <>
          <JournalUnavailable />
          <ToolboxBreatheOnly hasPlus={hasPlus} />
        </>
      ) : (
        <ToolboxEditor initial={parseToolboxItems(data)} hasPlus={hasPlus} />
      )}
    </section>
  );
}
