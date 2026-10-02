import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";
import { pageGate } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SignInForm } from "./SignInForm";

// Behind web-journal-live (the proxy 404s it on Production until then).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/sign-in">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return pageMetadata({ locale: locale as Locale, path: "/sign-in", title: t("signinSubmit"), noindex: true });
}

export default async function SignInPage({ params, searchParams }: PageProps<"/[locale]/sign-in">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("web-journal-live") === "hidden") notFound();

  // Already signed in → straight to the journal.
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (user) redirect({ href: "/app", locale });

  const t = await getTranslations("auth");
  // Set by the proxy when the account no longer exists (deleted on another
  // device): the stale session is already cleared.
  const signedOut = (await searchParams).signed_out === "1";
  return (
    <PageShell title={t("signinTitle")}>
      {signedOut && (
        <p role="status" data-testid="account-gone" className="rounded-2xl border border-border bg-surface px-5 py-4 font-medium text-text">
          {t("accountGoneNotice")}
        </p>
      )}
      <SignInForm />
    </PageShell>
  );
}
