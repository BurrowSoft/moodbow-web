import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { BackLink } from "@/components/BackLink";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { pageGate } from "@/lib/conditions";
import { currentUser } from "@/lib/journal/currentUser";
import { getMe } from "@/lib/journal/me";
import { printDays } from "@/lib/journal/printMonth";
import { dateLocale } from "@/lib/journal/today";
import { readJournalBetween, readJournalDates } from "@/lib/plus/insightsData";
import { parsePdfPeriod, pdfRange, periodsWithData, type PdfPeriod } from "@/lib/plus/journalPdf";
import { readPlusView } from "@/lib/plus/view";
import { formatMonth } from "@/lib/share/moodbow";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JournalPdf } from "./JournalPdf";

// A year of entries can take a while to read (in pages of 1,000).
export const maxDuration = 30;

const periodTitle = (p: PdfPeriod, tag: string) => (p.kind === "month" ? formatMonth(p.key, tag) : p.key);

// The title is the file name "Save as PDF" suggests: "Moodbow journal – October 2026".
export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/app/me/journal-pdf">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "plus" });
  const period = parsePdfPeriod((await searchParams).period, "9999-12-31");
  const tag = dateLocale(locale, (await headers()).get("accept-language"), null);
  return { title: { absolute: period ? t("pdfFileTitle", { period: periodTitle(period, tag) }) : t("rowPdf") }, robots: { index: false, follow: false } };
}

// Me → the designed PDF journal (decision 246, flag "plus"; Plus only). The
// person's own check-ins and entries, read through RLS by date (no AI text),
// laid out for print and never stored. Without Plus: the Plus screen.
export default async function JournalPdfPage({ params, searchParams }: PageProps<"/[locale]/app/me/journal-pdf">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("plus") === "hidden") notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const [me, view] = await Promise.all([getMe(supabase), readPlusView(supabase, user.id)]);
  if (!me || !view) return <JournalUnavailable />;
  if (view.kind !== "plus") return redirect({ href: "/app/me/plus", locale });

  const tag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);
  const period = parsePdfPeriod((await searchParams).period, me.today);
  const dates = await readJournalDates(supabase, me.today);
  if (!dates) return <JournalUnavailable />;
  const { months, years } = periodsWithData(dates);
  let days: ReturnType<typeof printDays> = [];
  if (period) {
    const { from, to } = pdfRange(period);
    const read = await readJournalBetween(supabase, from, to);
    if (!read) return <JournalUnavailable />;
    days = printDays(read.checkIns, read.entries);
  }
  const ta = await getTranslations("app");
  return (
    <section className="space-y-4">
      <div className="print:hidden">
        <BackLink href="/app/me" label={ta("navBackTo", { screen: ta("tabMe") })} testId="nav-back" />
      </div>
      <JournalPdf period={period} title={period ? periodTitle(period, tag) : null} days={days} months={months} years={years} dateLocaleTag={tag} />
    </section>
  );
}
