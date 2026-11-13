import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { pickMessages } from "@/i18n/clientMessages";
import { PageShell } from "@/components/PageShell";
import { GetHelpNow } from "@/components/SafetyCard";
import { SignedInMark } from "@/components/SignedInMark";
import { pageGate } from "@/lib/conditions";
import { getMe, hasCurrentConsent, hasCurrentConsents } from "@/lib/journal/me";
import { pageMetadata } from "@/lib/metadata";
import { isAuthOutage } from "@/lib/supabase/proxy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { askAiConsent } from "@/lib/journal/ai";
import { offeredLocales } from "@/i18n/routing";
import { savedLanguageRoute } from "@/lib/savedLanguage";
import { SavedLanguageRedirect } from "../app/SavedLanguageRedirect";
import { ConsentForm } from "./ConsentForm";

// Consent (M3): before Create account for new people; for signed-in people
// whose consents aren't current, before anything else. Behind
// web-journal-live.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/consent">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return pageMetadata({ locale: locale as Locale, path: "/consent", title: t("consentTitle"), noindex: true });
}

export default async function ConsentPage({ params }: PageProps<"/[locale]/consent">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("web-journal-live") === "hidden") notFound();

  const supabase = await createSupabaseServerClient();
  const { data, error } = supabase ? await supabase.auth.getUser() : { data: { user: null }, error: null };
  const user = data.user;
  // Auth didn't answer: a signed-in person we can't see right now. The form
  // with the generic error (its Continue answers the same until Auth is
  // back), never the new-account flow's Back to Welcome.
  const outage = !user && isAuthOutage(error);
  let askAge = false;
  let country: string | null | undefined = null;
  if (supabase && user) {
    const me = await getMe(supabase);
    // Consents already current (the versions this build ships) → nothing to ask.
    if (me && hasCurrentConsents(me)) redirect({ href: "/app", locale });
    const language = savedLanguageRoute(me?.profile?.locale, locale, offeredLocales());
    if (language) return <SavedLanguageRedirect locale={language} />;
    askAge = !me || !hasCurrentConsent(me, "age_18");
    country = me?.profile?.country;
  }

  const t = await getTranslations("onboarding");
  const ta = await getTranslations("auth");
  return (
    <PageShell title={t("consentTitle")} capTitle>
      {user && <SignedInMark />}
      {outage && (
        <p role="alert" data-testid="consent-outage" className="font-medium text-accent">
          {ta("errGeneric")}
        </p>
      )}
      {/* Help first (UX): it's never behind a consent, new or asked again. The card and its
          words only come to this page, which the root layout doesn't send them to. */}
      <NextIntlClientProvider messages={pickMessages(await getMessages(), ["me", "safety", "common"])}>
        <div className="[font-size:min(1rem,max(10vw,32px))] [&_a]:min-h-[44px] [&_button]:min-h-[44px]">
          <GetHelpNow country={country} testId="consent-get-help" neutral />
        </div>
      </NextIntlClientProvider>
      {/* Who keeps what, above the boxes and never collapsed, so nobody consents with it off screen
          (decisions 224, 226). Under the safety card's cap, so at large text the boxes stay close:
          the type stops growing, and nothing is cut off. */}
      <p data-testid="consent-notice" className="text-text max-sm:[font-size:min(1rem,max(10vw,32px))] [overflow-wrap:anywhere]">
        {t("consentNotice")}
      </p>
      <ConsentForm askAge={askAge} askAi={askAiConsent()} showBack={!user && !outage} />
    </PageShell>
  );
}
