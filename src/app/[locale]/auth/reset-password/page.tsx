import type { Metadata } from "next";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { helpCardMessages } from "@/i18n/clientMessages";
import type { Locale } from "@/i18n/routing";
import { SignedInMark } from "@/components/SignedInMark";
import { StatusShell } from "@/components/StatusShell";
import { pageMetadata } from "@/lib/metadata";
import { isAuthOutage } from "@/lib/supabase/proxy";
import { getMe } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { offeredLocales } from "@/i18n/routing";
import { savedLanguageRoute } from "@/lib/savedLanguage";
import { languageGateCopy } from "@/lib/savedLanguageGate.server";
import type { SavedLanguageCopy } from "@/lib/savedLanguageCopy";
import { SavedLanguageGate } from "../../app/SavedLanguageGate";
import { ResetPasswordForm } from "./ResetPasswordForm";

// Reached from /auth/confirm?type=recovery, which leaves a short-lived
// session in cookies. Without that session (expired link, opened directly)
// the expired copy is shown. Never indexed.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/auth/reset-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "resetPassword" });
  return pageMetadata({ locale: locale as Locale, path: "/auth/reset-password", title: t("title"), noindex: true });
}

export default async function ResetPasswordPage({ params, searchParams }: PageProps<"/[locale]/auth/reset-password">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  // After a successful reset (the action redirects here; the session is
  // already gone, signed out everywhere).
  if ((await searchParams).status === "changed") {
    const t = await getTranslations("resetPassword");
    return (
      <StatusShell
        title={t("successTitle")}
        body={
          <p role="status" data-testid="reset-done">
            {t("success")}
          </p>
        }
      />
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = supabase ? await supabase.auth.getUser() : { data: { user: null }, error: null };
  const user = data.user;

  // Their saved language first (row RT4), never a bare link (#401): the gate around the form.
  let move: { target: string; copy: SavedLanguageCopy } | null = null;
  let country: string | null | undefined = null;
  if (supabase && user) {
    const me = await getMe(supabase);
    const language = savedLanguageRoute(me?.profile?.locale, locale, offeredLocales());
    if (language) move = { target: language, copy: await languageGateCopy(language, locale) };
    country = me?.profile?.country;
  }

  // Auth didn't answer: the link may still be good, so not "expired". The
  // form, with the generic error above it; saving works once Auth is back
  // (Web Tester + reviewer, #18).
  if (!user && isAuthOutage(error)) {
    const t = await getTranslations("resetPassword");
    const ta = await getTranslations("auth");
    return (
      <StatusShell
        title={t("title")}
        body={
          <p role="alert" data-testid="reset-outage" className="font-medium text-accent">
            {ta("errGeneric")}
          </p>
        }
      >
        <div className="w-full text-left">
          <ResetPasswordForm />
        </div>
      </StatusShell>
    );
  }

  if (!user) {
    const t = await getTranslations("emailConfirmed");
    return (
      <StatusShell title={t("errorTitle")} body={<p data-testid="reset-expired">{t("errorBody")}</p>} />
    );
  }

  const t = await getTranslations("resetPassword");
  const page = (
    <StatusShell title={t("title")}>
      <SignedInMark />
      <div className="w-full text-left">
        <ResetPasswordForm />
      </div>
    </StatusShell>
  );
  return move ? (
    <SavedLanguageGate target={move.target} here={locale} copy={move.copy} country={country} standalone helpMessages={helpCardMessages(await getMessages())}>
      {page}
    </SavedLanguageGate>
  ) : (
    page
  );
}
