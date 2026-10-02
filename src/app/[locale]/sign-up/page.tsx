import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";
import { pageGate } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";
import { CONSENT_COOKIE, parseConsentCookie } from "@/lib/onboardingConsent";
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
  // Consent first (M3): without its grants, back to Consent.
  if (!parseConsentCookie((await cookies()).get(CONSENT_COOKIE)?.value)) redirect({ href: "/consent", locale });

  const t = await getTranslations("onboarding");
  return (
    <PageShell title={t("signupTitle")}>
      <SignUpForm />
    </PageShell>
  );
}
