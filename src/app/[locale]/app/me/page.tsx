import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { currentUser } from "@/lib/journal/currentUser";
import { conditionMet, pageGate } from "@/lib/conditions";
import { aiShown, FOCUS_AREAS, isTone } from "@/lib/journal/ai";
import { getMe, hasCurrentConsent } from "@/lib/journal/me";
import { SUPPORT_EMAIL } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tabMetadata } from "../pageMeta";
import { SignOutButton } from "./SignOutButton";
import { GetHelpNow } from "@/components/SafetyCard";
import { BoMeRowLive } from "../bo/BoMeRow";
import { JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { AiSettings } from "./AiSettings";
import { Appearance } from "./Appearance";
import { LanguageRegion } from "./LanguageRegion";
import { countryOptions, timeZoneOptions } from "@/lib/region/countries";
import { offeredLocales, routeLocale } from "@/i18n/routing";
import { Reminder } from "./Reminder";
import { YourData } from "./YourData";
import { ImportData } from "./ImportData";
import { headers } from "next/headers";
import { dateLocale } from "@/lib/journal/today";

// The export (export_my_data may take 30 s: lib/supabase/deadline) and the
// import batches run in this page's functions: 60, so their own clean error
// comes back before the platform stops the function (reviewer, #122).
export const maxDuration = 60;

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me">): Promise<Metadata> {
  return tabMetadata("tabMe", (await params).locale);
}

// "21:00:00" (the database) → "21:00" (the time field).
const hhmm = (time: string | null | undefined) => (time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "21:00");

// Me (M7), in the spec's order. Here: AI (M9, only when AI is shown) ·
// Reminder · Language & region · Appearance · Your data · Help · Sign out. No
// version: there's only one web version at a time; the app keeps its own (UX &
// PM 2026-11-06). Get help now (top) comes with the safety card (M8); App lock
// is app-only; Appearance is per device (decision 133).
export default async function MePage({ params }: PageProps<"/[locale]/app/me">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;
  const t = await getTranslations("app");
  const tm = await getTranslations("me");
  const tc = await getTranslations("common");
  const link = "font-medium text-accent underline underline-offset-4";
  // Bo's row, also where Bo is off (the conversation stays theirs). A failed read keeps
  // Clear reachable, and the switch off: off is the default, and what the function reads.
  let boHas = false;
  let boReads = false;
  if (pageGate("bo-live") !== "hidden") {
    const [kept, settings] = await Promise.all([
      supabase.from("bo_messages").select("id").limit(1),
      supabase.from("user_settings").select("bo_reads_journal").maybeSingle(),
    ]);
    boHas = kept.error ? true : (kept.data ?? []).length > 0;
    boReads = (settings.data as { bo_reads_journal?: boolean } | null)?.bo_reads_journal === true;
  }

  return (
    <section className="space-y-8">
      <h1 className={JOURNAL_HEADING}>{t("tabMe")}</h1>
      {/* Get help now (M8): at the top, on its own, AI or not; not repeated
          under Help (decision 128). */}
      <GetHelpNow country={me.profile?.country} testId="me-get-help" neutral />

      {aiShown(me) && (
        <AiSettings
          initial={{
            on: me.settings?.ai_enabled === true && hasCurrentConsent(me, "ai"),
            tone: isTone(me.settings?.tone) ? me.settings.tone : "warm",
            focus: FOCUS_AREAS.filter((a) => me.settings?.focus_areas?.includes(a)),
          }}
          credits={{ balance: me.credits?.balance ?? 0 }}
        />
      )}
      {pageGate("bo-live") !== "hidden" && <BoMeRowLive uid={user.id} hasConversation={boHas} readsJournal={boReads} consented={hasCurrentConsent(me, "ai")} turnedOff={me.settings?.bo_off === true} />}
      <Reminder on={me.settings?.reminder_on ?? true} time={hhmm(me.settings?.reminder_time)} />
      <LanguageRegion
        initial={{ locale: routeLocale(me.profile?.locale ?? locale), country: me.profile?.country ?? "", time_zone: me.profile?.time_zone ?? "UTC" }}
        countries={countryOptions(locale)}
        zones={timeZoneOptions(me.profile?.time_zone)}
        languages={offeredLocales().map((code): [string, string] => [code, tc(`languageNames.${code}`)])}
      />
      <Appearance shortcuts={pageGate("shortcuts-live") !== "hidden"} />
      <YourData credits={me.credits?.balance ?? 0} uid={user.id} csv={pageGate("export-csv-live") !== "hidden"} ai={conditionMet("ai-live")} />
      {/* Import from another app (1.1 K), with Your data, where it's on. */}
      {pageGate("import-live") !== "hidden" && (
        <ImportData uid={user.id} today={me.today} dateLocaleTag={dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null)} country={me.profile?.country} />
      )}

      <section aria-labelledby="me-help" className="rounded-3xl border border-border bg-surface p-[24px]">
        <h2 id="me-help" className="text-lg font-medium text-text">
          {tm("meHelp")}
        </h2>
        <ul className="mt-4 space-y-3">
          <li>
            <Link href="/help" data-testid="me-faq" className={link}>
              {tm("meFaq")}
            </Link>
          </li>
          {/* The legal pages only where they're shown (their conditions). */}
          {pageGate("privacy-text-approved") !== "hidden" && (
            <li>
              <Link href="/privacy" data-testid="me-privacy" className={link}>
                {tm("mePrivacy")}
              </Link>
            </li>
          )}
          {pageGate("terms-text-approved") !== "hidden" && (
            <li>
              <Link href="/terms" data-testid="me-terms" className={link}>
                {tm("meTerms")}
              </Link>
            </li>
          )}
          <li>
            <a href={`mailto:${SUPPORT_EMAIL}`} data-testid="me-contact" className={link}>
              {tm("meContact")}
            </a>
          </li>
        </ul>
      </section>

      <SignOutButton uid={user.id} />
    </section>
  );
}
