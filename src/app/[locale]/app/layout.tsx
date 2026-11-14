import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link, redirect } from "@/i18n/navigation";
import { offeredLocales } from "@/i18n/routing";
import { savedLanguageRoute } from "@/lib/savedLanguage";
import { pageGate } from "@/lib/conditions";
import { getMe, onboardingStep } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { isAuthOutage } from "@/lib/supabase/proxy";
import { AnnouncerProvider } from "./Announcer";
import { AppNav } from "./AppNav";
import { CheckInDraftProvider } from "./CheckInDraft";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { NavProgress } from "@/components/NavProgress";
import { SavedLanguageRedirect } from "./SavedLanguageRedirect";
import { APP_MAIN_GUTTER } from "@/lib/ui/journalLayout";

// The signed-in web journal. Behind web-journal-live: the proxy 404s /app on
// Production until it's met; this check is the backstop. Signed-out visitors
// go to sign-in; anyone without current consents goes to Consent. Set up comes after first use
// (1.3 §6), offered on Today. Data access is enforced by RLS and
// the RPCs, not by these redirects.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children, params }: LayoutProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("web-journal-live") === "hidden") notFound();

  const supabase = await createSupabaseServerClient();
  const { data, error } = supabase ? await supabase.auth.getUser() : { data: { user: null }, error: null };
  // Supabase Auth unreachable: the session may be fine, so no sign-out look.
  if (!data.user && isAuthOutage(error)) return <NextIntlClientProvider messages={await getMessages()}><JournalUnavailable standalone /></NextIntlClientProvider>;
  const user = data.user;
  if (!supabase || !user) return redirect({ href: "/sign-in", locale });

  const me = await getMe(supabase);
  // Signed in but the data didn't load: an error state, not a redirect loop.
  if (!me) return <NextIntlClientProvider messages={await getMessages()}><JournalUnavailable standalone /></NextIntlClientProvider>;
  const step = onboardingStep(me);
  if (step === "consent") redirect({ href: "/consent", locale });
  // Setup after first use (1.3 §6): the journal opens at once. The first time, onboarding is
  // completed with protective defaults: the reminder off until they choose one; tone and focus
  // stay at their defaults; AI only as its own consent says. Today then offers Setup.
  if (step === "setup") {
    const { error: setupError } = await supabase.rpc("complete_onboarding", { p_reminder_on: false, p_reminder_time: "21:00" });
    if (setupError) return <NextIntlClientProvider messages={await getMessages()}><JournalUnavailable standalone /></NextIntlClientProvider>;
  }
  // Their saved language wins in the journal, if it's offered (row RT4).
  const language = savedLanguageRoute(me.profile?.locale, locale, offeredLocales());
  if (language) return <SavedLanguageRedirect locale={language} />;

  const t = await getTranslations("me");
  // The journal's client components get every message (the root layout sends
  // only the public namespaces, perf fix 3).
  return (
    <NextIntlClientProvider messages={await getMessages()}>
      {/* data-journal: the journal's own rules in globals.css (hyphenation at large text). */}
      <div data-journal="" className="flex flex-1 flex-col md:flex-row">
        {/* It reads the search params: its own Suspense boundary. */}
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <AppNav />
        {/* "/" opens Timeline search wherever search itself is shown. */}
        {pageGate("shortcuts-live") !== "hidden" && <KeyboardShortcuts search={pageGate("search-live") !== "hidden"} />}
        {/* At least a screen tall: the page streams in after a first paint
            (the loading fallback) that's shorter than the screen, and the
            footer under it would be pushed down in view. Kept below the fold,
            nothing visible moves (Today CLS 0.13, Web Tester #82 isolation).
            On paper neither applies (no trailing blank page; 1.1 N). */}
        {/* The bottom padding clears the phone bar's real height (--tab-bar-h, AppNav), 7rem
            before it's measured; a page that sets the bar aside keeps only a little. */}
        <main id="main" className={`min-h-dvh min-w-0 flex-1 ${APP_MAIN_GUTTER} pb-[calc(var(--tab-bar-h,5.5rem)+1.5rem)] in-data-[tabs-aside]:max-md:pb-6 pt-[max(16px,calc(56px-1rem))] md:pb-10 md:pt-10 print:min-h-0 print:p-0`}>
          {/* With scripts off a page's content never appears here, as it's streamed: help still does (#249). */}
          <noscript>
            <div className="mx-auto mb-6 max-w-3xl space-y-3 max-sm:[font-size:min(1rem,max(10vw,32px))]">
              <p>
                <Link href="/help/get-help-now" prefetch={false} data-testid="app-noscript-help" className="font-medium text-accent underline underline-offset-4">
                  {t("meGetHelpNow")}
                </Link>
              </p>
              <p data-testid="app-noscript-journal" className="text-muted">{t("meNoScript")}</p>
            </div>
          </noscript>
          {/* Per user: another account signing in starts empty (#9765 M-01). */}
          <div className="mx-auto max-w-3xl">
            <AnnouncerProvider>
              <CheckInDraftProvider key={user.id}>{children}</CheckInDraftProvider>
            </AnnouncerProvider>
          </div>
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
