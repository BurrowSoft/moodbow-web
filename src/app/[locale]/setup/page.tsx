import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";
import { pageGate } from "@/lib/conditions";
import { getMe, onboardingStep } from "@/lib/journal/me";
import { pageMetadata } from "@/lib/metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SetupForm } from "./SetupForm";

// Set up (M3): signed in, consents current, not onboarded yet. Behind
// web-journal-live.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/setup">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return pageMetadata({ locale: locale as Locale, path: "/setup", title: t("setupTitle"), noindex: true });
}

export default async function SetupPage({ params }: PageProps<"/[locale]/setup">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("web-journal-live") === "hidden") notFound();

  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return redirect({ href: "/sign-in", locale });
  const me = await getMe(supabase);
  // Signed in but the data didn't load: an error state, not a redirect loop.
  if (!me) return <JournalUnavailable />;
  const step = onboardingStep(me);
  if (step === "consent") redirect({ href: "/consent", locale });
  if (step === "journal") redirect({ href: "/app", locale });

  const t = await getTranslations("onboarding");
  return (
    <PageShell title={t("setupTitle")}>
      <SetupForm />
    </PageShell>
  );
}
