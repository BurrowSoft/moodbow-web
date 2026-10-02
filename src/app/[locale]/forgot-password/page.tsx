import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { PageShell } from "@/components/PageShell";
import { pageGate } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

// Behind web-journal-live (the proxy 404s it on Production until then).
export async function generateMetadata({ params }: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return pageMetadata({ locale: locale as Locale, path: "/forgot-password", title: t("resetTitle"), noindex: true });
}

export default async function ForgotPasswordPage({ params }: PageProps<"/[locale]/forgot-password">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("web-journal-live") === "hidden") notFound();
  const t = await getTranslations("auth");
  return (
    <PageShell title={t("resetTitle")}>
      <ForgotPasswordForm />
    </PageShell>
  );
}
