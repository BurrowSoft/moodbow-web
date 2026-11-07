import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { PageShell } from "@/components/PageShell";
import { pageMetadata } from "@/lib/metadata";
import { securityUpdate } from "@/lib/securityUpdate";

// The public page a security notice points to. Signed out too: for an account with no email
// that has lost its sign-in, it's the only way to hear. A 404 until a notice file exists.
export async function generateMetadata({ params }: PageProps<"/[locale]/security">): Promise<Metadata> {
  const { locale } = await params;
  const update = securityUpdate(locale);
  if (!update) return {};
  return pageMetadata({ locale: locale as Locale, path: "/security", title: update.title });
}

export default async function SecurityPage({ params }: PageProps<"/[locale]/security">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const update = securityUpdate(locale);
  if (!update) notFound();
  const t = await getTranslations("legal");
  return (
    <PageShell capTitle title={update.title} article notice={update.english && locale !== "en" ? t("legalEnglishOnly") : undefined} lang={update.english && locale !== "en" ? "en" : undefined}>
      <div className="legal-prose" data-testid="security-update" dangerouslySetInnerHTML={{ __html: update.html }} />
    </PageShell>
  );
}
