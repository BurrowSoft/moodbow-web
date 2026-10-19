import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { pageGate } from "@/lib/conditions";
import { aiShown, FOCUS_AREAS, isTone } from "@/lib/journal/ai";
import { getMe, hasCurrentConsent } from "@/lib/journal/me";
import { SUPPORT_EMAIL } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import packageJson from "../../../../../package.json";
import { tabMetadata } from "../TabPlaceholder";
import { signOut } from "./actions";
import { AiSettings } from "./AiSettings";
import { Reminder } from "./Reminder";
import { YourData } from "./YourData";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me">): Promise<Metadata> {
  return tabMetadata("tabMe", (await params).locale);
}

// "21:00:00" (the database) → "21:00" (the time field).
const hhmm = (time: string | null | undefined) => (time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "21:00");

// Me (M7), in the spec's order. Here: AI (M9, only when AI is shown) ·
// Reminder · Your data · Help · Sign out · version. Language & region with the shared
// country list, Get help now with the safety card; App lock is app-only and
// Appearance waits for its condition.
export default async function MePage({ params }: PageProps<"/[locale]/app/me">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;
  const t = await getTranslations("app");
  const tm = await getTranslations("me");
  const link = "font-medium text-accent underline underline-offset-4";

  return (
    <section className="space-y-8">
      <h1 className="text-3xl font-medium tracking-tight">{t("tabMe")}</h1>
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
      <Reminder on={me.settings?.reminder_on ?? true} time={hhmm(me.settings?.reminder_time)} />
      <YourData credits={me.credits?.balance ?? 0} uid={user.id} />

      <section aria-labelledby="me-help" className="rounded-3xl border border-border bg-surface p-6">
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

      <form action={signOut}>
        <button
          type="submit"
          data-testid="me-sign-out"
          className="inline-flex min-h-12 items-center rounded-full border border-border px-6 font-medium text-accent hover:bg-pill"
        >
          {t("meSignOut")}
        </button>
      </form>
      <p className="text-sm text-muted" data-testid="me-version">
        {tm("meVersion", { version: packageJson.version })}
      </p>
    </section>
  );
}
