import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";

export default async function LocaleNotFound() {
  const t = await getTranslations("notFound");
  return (
    <PageShell title={t("title")}>
      {/* Tells the visit counts to send nothing for this page (lib/analytics.ts). */}
      <p data-not-found="">{t("body")}</p>
      <p>
        <Link href="/" className="font-medium text-accent underline underline-offset-4">
          {t("home")}
        </Link>
      </p>
    </PageShell>
  );
}
