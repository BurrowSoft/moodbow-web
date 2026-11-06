import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { offeredLocales } from "@/i18n/routing";
import { savedLanguageRoute } from "@/lib/savedLanguage";
import { pageGate } from "@/lib/conditions";
import { getMe, onboardingStep } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { isAuthOutage } from "@/lib/supabase/proxy";
import { AnnouncerProvider } from "./Announcer";
import { headers } from "next/headers";
import { AppNav } from "./AppNav";
import { BoButton } from "./BoButton";
import { CheckInDraftProvider } from "./CheckInDraft";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { NavProgress } from "@/components/NavProgress";
import { SavedLanguageRedirect } from "./SavedLanguageRedirect";
import { APP_MAIN_GUTTER } from "@/lib/ui/journalLayout";

// The signed-in web journal. Behind web-journal-live: the proxy 404s /app on
// Production until it's met; this check is the backstop. Signed-out visitors
// go to sign-in; anyone without current consents goes to Consent, then Set up
// until onboarded (M3, same as the app). Data access is enforced by RLS and
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
  if (!data.user && isAuthOutage(error)) return <JournalUnavailable standalone />;
  const user = data.user;
  if (!supabase || !user) return redirect({ href: "/sign-in", locale });

  const me = await getMe(supabase);
  // Signed in but the data didn't load: an error state, not a redirect loop.
  if (!me) return <JournalUnavailable standalone />;
  const step = onboardingStep(me);
  if (step === "consent") redirect({ href: "/consent", locale });
  if (step === "setup") redirect({ href: "/setup", locale });
  // Their saved language wins in the journal, if it's offered (row RT4).
  const language = savedLanguageRoute(me.profile?.locale, locale, offeredLocales());
  if (language) return <SavedLanguageRedirect locale={language} />;

  // Bo's button: where bo-live is on, and the country is on Bo's list or this person
  // is exempt. It only decides whether the button shows; the function decides
  // whether Bo opens, from a signed token. A failed read: no button.
  let boVisible = false;
  if (pageGate("bo-live") !== "hidden") {
    const { data: visible } = await supabase.rpc("bo_visible", { p_country: (await headers()).get("x-vercel-ip-country") });
    boVisible = visible === true;
  }

  // The journal's client components get every message (the root layout sends
  // only the public namespaces, perf fix 3).
  return (
    <NextIntlClientProvider messages={await getMessages()}>
      <div className="flex flex-1 flex-col md:flex-row">
        {/* It reads the search params: its own Suspense boundary. */}
        {boVisible && <BoButton />}
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
        <main id="main" className={`min-h-dvh min-w-0 flex-1 ${APP_MAIN_GUTTER} pb-28 pt-10 md:pb-10 print:min-h-0 print:p-0`}>
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
