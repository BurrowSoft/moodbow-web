import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { pickMessages } from "@/i18n/clientMessages";
import { GetHelpNow } from "@/components/SafetyCard";
import { conditionMet, pageGate } from "@/lib/conditions";
import { askAiConsent } from "@/lib/journal/ai";
import { pageMetadata } from "@/lib/metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SignUpForm } from "./SignUpForm";

// Create account (M3, after Consent). Behind web-journal-live.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/sign-up">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return pageMetadata({ locale: locale as Locale, path: "/sign-up", title: t("signupTitle"), noindex: true });
}

export default async function SignUpPage({ params }: PageProps<"/[locale]/sign-up">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("web-journal-live") === "hidden") notFound();

  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (user) redirect({ href: "/app", locale });
  // The consent boxes are on this form now (1.3 §6): separate, unticked, each with its link, and
  // checked again by the action. /consent stays for signed-in accounts that owe a consent.

  const t = await getTranslations("onboarding");
  const ta = await getTranslations("auth");
  return (
    <PageShell title={t("signupTitle")}>
      {/* Someone who started in the app without an email (decision 216):
          the web has no anonymous sessions, so they back up there first. */}
      {pageGate("anon-start-live") !== "hidden" && (
        <p data-testid="auth-started-in-app" className="text-muted">
          {ta("startedInApp")}
        </p>
      )}
      <SignUpForm askAi={askAiConsent()} healthLink={conditionMet("consumer-health-data-approved")} />
      {/* Help is never behind a consent, as on Consent: its card and words come only to this page. */}
      <NextIntlClientProvider messages={pickMessages(await getMessages(), ["me", "safety", "common"])}>
        <div className="mt-[24px] [font-size:min(1rem,max(10vw,32px))] [&_a]:min-h-[44px] [&_button]:min-h-[44px]">
          <GetHelpNow country={null} testId="signup-get-help" neutral />
        </div>
      </NextIntlClientProvider>
    </PageShell>
  );
}
