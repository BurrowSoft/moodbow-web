import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { PageShell } from "@/components/PageShell";
import { conditionMet, pageGate } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";
import { BACKUP_RETENTION_DAYS, SUPPORT_EMAIL } from "@/lib/site";

// Google Play's account-deletion URL. The steps are only true once
// Me → Delete account ships on the app and the web ("delete-account-live").
const GATE = "delete-account-live" as const;

// It states data-retention policy and is the address Play's Data safety
// form points to, so it's treated as legal (UX, #112): in English on every
// language's page, under that language's legalEnglishOnly line, with the
// same gate. (th.json keeps accountDeletion only for key parity; unused.)
const ACCOUNT_DELETION_TEXT_LOCALE = "en";

export async function generateMetadata({ params }: PageProps<"/[locale]/account-deletion">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: ACCOUNT_DELETION_TEXT_LOCALE, namespace: "accountDeletion" });
  return pageMetadata({
    locale: locale as Locale,
    path: "/account-deletion",
    title: t("title"),
    description: t("description"),
    noindex: pageGate(GATE) !== "live",
  });
}

export default async function AccountDeletionPage({ params }: PageProps<"/[locale]/account-deletion">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const gate = pageGate(GATE);
  if (gate === "hidden") notFound();
  const t = await getTranslations({ locale: ACCOUNT_DELETION_TEXT_LOCALE, namespace: "accountDeletion" });
  const tl = await getTranslations("legal");
  const english = locale !== ACCOUNT_DELETION_TEXT_LOCALE;
  // Text = enforcement: the backups line needs the confirmed number.
  const backupDays = conditionMet("backup-retention") ? BACKUP_RETENTION_DAYS : null;

  return (
    <PageShell
      title={t("title")}
      draft={gate === "draft"}
      article
      notice={english ? tl("legalEnglishOnly") : undefined}
      lang={english ? ACCOUNT_DELETION_TEXT_LOCALE : undefined}
    >
      <p>{t("intro")}</p>
      <p className="rounded-2xl border border-border bg-surface px-5 py-4 font-medium text-text">{t("steps")}</p>
      <p>{t("what")}</p>
      {backupDays !== null && <p data-testid="backups-line">{t("backups", { days: backupDays })}</p>}
      <p>
        {t.rich("noAccess", {
          email: SUPPORT_EMAIL,
          support: (chunks) => (
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-accent underline underline-offset-4">
              {chunks}
            </a>
          ),
        })}
      </p>
    </PageShell>
  );
}
