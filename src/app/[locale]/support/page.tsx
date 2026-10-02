import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";
import { conditionMet } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";
import { SUPPORT_EMAIL } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/support">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "support" });
  return pageMetadata({ locale: locale as Locale, path: "/support", title: t("title"), description: t("description") });
}

export default async function SupportPage({ params }: PageProps<"/[locale]/support">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("support");

  return (
    <PageShell title={t("title")}>
      <p>{t("body")}</p>
      <p>
        {t("emailLabel")}:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-accent underline underline-offset-4">
          {SUPPORT_EMAIL}
        </a>
      </p>
      {conditionMet("delete-account-live") && (
        <p>
          <Link href="/account-deletion" className="font-medium text-accent underline underline-offset-4">
            {t("deleteLink")}
          </Link>
        </p>
      )}
    </PageShell>
  );
}
