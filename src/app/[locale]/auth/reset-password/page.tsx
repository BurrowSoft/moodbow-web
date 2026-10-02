import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { PageShell } from "@/components/PageShell";
import { pageMetadata } from "@/lib/metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
      <PageShell title={t("successTitle")}>
        <p role="status" data-testid="reset-done" className="rounded-2xl border border-border bg-surface px-5 py-4 font-medium text-text">
          {t("success")}
        </p>
      </PageShell>
    );
  }

  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (!user) {
    const t = await getTranslations("emailConfirmed");
    return (
      <PageShell title={t("errorTitle")}>
        <p data-testid="reset-expired">{t("errorBody")}</p>
      </PageShell>
    );
  }

  const t = await getTranslations("resetPassword");
  return (
    <PageShell title={t("title")}>
      <ResetPasswordForm />
    </PageShell>
  );
}
