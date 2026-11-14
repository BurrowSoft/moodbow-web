import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { BackLink } from "@/components/BackLink";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { GetHelpNow } from "@/components/SafetyCard";
import { pageGate } from "@/lib/conditions";
import { currentUser } from "@/lib/journal/currentUser";
import { getMe } from "@/lib/journal/me";
import { parsePlan } from "@/lib/journal/safetyPlan";
import { parseToolboxItems } from "@/lib/journal/toolbox";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { titledMetadata } from "../../pageMeta";
import { SafetyPlanEditor } from "./SafetyPlanEditor";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me/safety-plan">): Promise<Metadata> {
  const { locale } = await params;
  return titledMetadata((await getTranslations({ locale, namespace: "safetyPlan" }))("title"), locale);
}

// Me → My safety plan (1.2, safety-plan-live): the person's plan, read from migration 026's
// tables and the toolbox's. A failed read says so, with nothing to change, and help still
// there: help never depends on the plan.
export default async function SafetyPlanPage({ params }: PageProps<"/[locale]/app/me/safety-plan">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("safety-plan-live") === "hidden") notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const [me, row, people, toolbox] = await Promise.all([
    getMe(supabase),
    supabase.from("safety_plans").select("warning_signs, distractions, surroundings").maybeSingle(),
    supabase.from("safety_plan_people").select("id, section, name, phone, position"),
    supabase.from("toolbox_items").select("id, text, position").order("position"),
  ]);
  const t = await getTranslations("safetyPlan");
  const ta = await getTranslations("app");
  const unread = !me || row.error || people.error || toolbox.error;
  return (
    <section className="space-y-6">
      {/* Help in the first view at every size (UX, Web Tester at 320 px and 300 %): beside Back,
          above the title, whatever the plan holds or whether it loaded. Back is its icon alone. */}
      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[8px]">
        <BackLink href="/app/me" label={ta("navBackTo", { screen: ta("tabMe") })} testId="nav-back" />
        <GetHelpNow country={me?.profile?.country} testId="plan-get-help" neutral />
      </div>
      {/* At most 36 px on a phone (decision 231), so the plan's start isn't pushed down either. */}
      <h1 className={`${JOURNAL_HEADING} max-sm:[font-size:min(1.875rem,max(11.25vw,36px))]`} data-testid="plan-title">
        {t("title")}
      </h1>
      {unread ? (
        <JournalUnavailable />
      ) : (
        <SafetyPlanEditor initial={parsePlan(row.data, people.data)} toolbox={parseToolboxItems(toolbox.data)} country={me.profile?.country} />
      )}
    </section>
  );
}
