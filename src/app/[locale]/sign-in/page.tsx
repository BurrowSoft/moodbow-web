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

export default async function SignInPage({ params }: PageProps<"/[locale]/sign-in">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("web-journal-live") === "hidden") notFound();

  // Already signed in → straight to the journal.
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (user) redirect({ href: "/app", locale });

  const t = await getTranslations("auth");
  return (
    <PageShell title={t("signinTitle")}>
      <SignInForm />
    </PageShell>
  );
}
