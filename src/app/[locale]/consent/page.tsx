import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";
import { pageGate } from "@/lib/conditions";
import { getMe, hasCurrentConsent, hasCurrentConsents } from "@/lib/journal/me";
import { pageMetadata } from "@/lib/metadata";
import { isAuthOutage } from "@/lib/supabase/proxy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  if (supabase && user) {
    const me = await getMe(supabase);
    // Consents already current (the versions this build ships) → nothing to ask.
    if (me && hasCurrentConsents(me)) redirect({ href: "/app", locale });
    askAge = !me || !hasCurrentConsent(me, "age_18");
  }

  const t = await getTranslations("onboarding");
  const ta = await getTranslations("auth");
  return (
    <PageShell title={t("consentTitle")}>
      {outage && (
        <p role="alert" data-testid="consent-outage" className="font-medium text-accent">
          {ta("errGeneric")}
        </p>
      )}
      <ConsentForm askAge={askAge} showBack={!user && !outage} />
    </PageShell>
  );
}
