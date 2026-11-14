import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { headers } from "next/headers";
import { BackLink } from "@/components/BackLink";
import { GetHelpNow } from "@/components/SafetyCard";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { currentUser } from "@/lib/journal/currentUser";
import { getMe } from "@/lib/journal/me";
import { parseReportBody } from "@/lib/journal/report";
import { dateLine, dateLocale } from "@/lib/journal/today";
import { sixDaysAfter } from "@/lib/journal/yourWeek";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JOURNAL_CARD, JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { titledMetadata } from "../../pageMeta";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me/reports">): Promise<Metadata> {
  const { locale } = await params;
  return titledMetadata((await getTranslations({ locale, namespace: "me" }))("pastReports"), locale);
}

const SECTIONS = [
  ["changed", "reportChanged"],
  ["went_well", "reportWentWell"],
  ["notice", "reportNotice"],
  ["idea", "reportIdea"],
] as const;

// Me → Your past reports (Insights become Plus, ruling 10): the weekly AI reports already made,
// read-only, for everyone, Plus or not. No new report is made here, and nothing about credits. A
// report Moodbow answered with help (crisis) shows that text and help, as it did.
export default async function PastReportsPage({ params }: PageProps<"/[locale]/app/me/reports">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const [me, { data, error }] = await Promise.all([
    getMe(supabase),
    supabase.from("ai_reports").select("id, period_start, body").eq("kind", "weekly").order("period_start", { ascending: false }),
  ]);
  const t = await getTranslations("me");
  const tai = await getTranslations("ai");
  const ta = await getTranslations("app");
  const tag = dateLocale(locale, (await headers()).get("accept-language"), me?.profile?.country ?? null);
  const reports = ((data ?? []) as { id: string; period_start: string; body: unknown }[]).map((r) => ({ ...r, parsed: parseReportBody(r.body) })).filter((r) => r.parsed);
  return (
    <section className="space-y-6">
      {/* Help first, beside Back (every page with journal content), hidden on paper. */}
      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[8px] print:hidden">
        <BackLink href="/app/me" label={ta("navBackTo", { screen: ta("tabMe") })} testId="nav-back" />
        <GetHelpNow country={me?.profile?.country} testId="past-reports-get-help" neutral />
      </div>
      <h1 className={JOURNAL_HEADING} data-testid="past-reports-title">
        {t("pastReports")}
      </h1>
      <p className="text-muted">{t("pastReportsIntro")}</p>
      {error || !me ? (
        <JournalUnavailable />
      ) : (
        <ul data-testid="past-reports" className="space-y-4">
          {reports.map(({ id, period_start, parsed }) => (
            <li key={id} data-testid="past-report" className={JOURNAL_CARD}>
              <h2 className="font-medium text-text">
                {t("pastReportsWeek", { start: dateLine(period_start, tag), end: dateLine(sixDaysAfter(period_start), tag) })}
              </h2>
              {parsed && "crisis" in parsed ? (
                <div className="mt-2 space-y-3">
                  <p className="whitespace-pre-line text-text">{parsed.crisis}</p>
                  <GetHelpNow country={me.profile?.country} testId="past-report-get-help" neutral />
                </div>
              ) : (
                <div className="mt-2 space-y-3">
                  {SECTIONS.map(([field, heading]) => {
                    const text = parsed && "sections" in parsed ? (parsed.sections as Record<string, string | undefined>)[field] : undefined;
                    return text ? (
                      <div key={field}>
                        <h3 className="font-medium text-text">{tai(heading)}</h3>
                        <p className="mt-1 whitespace-pre-line text-text">{text}</p>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
