import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { PageShell } from "@/components/PageShell";
import { conditionMet, pageGate } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";
import { BACKUP_RETENTION_DAYS, SUPPORT_EMAIL } from "@/lib/site";
import { SupportAddress } from "@/lib/wholeNames";
import { accountDeletionTextLocale } from "@/lib/accountDeletion";

// Google Play's account-deletion URL. The steps are only true once
// Me → Delete account ships on the app and the web ("delete-account-live").
const GATE = "delete-account-live" as const;

// Its words: each live language's own (a help page, UX 20 Nov); see accountDeletionTextLocale.

export async function generateMetadata({ params }: PageProps<"/[locale]/account-deletion">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: accountDeletionTextLocale(locale), namespace: "accountDeletion" });
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
  const textLocale = accountDeletionTextLocale(locale);
  const t = await getTranslations({ locale: textLocale, namespace: "accountDeletion" });
  const tl = await getTranslations("legal");
  const english = textLocale !== locale;
  // Text = enforcement: the backups line needs the confirmed number.
  const backupDays = conditionMet("backup-retention") ? BACKUP_RETENTION_DAYS : null;

  return (
    <PageShell capTitle
      title={t("title")}
      draft={gate === "draft"}
      article
      notice={english ? tl("legalEnglishOnly") : undefined}
      lang={english ? textLocale : undefined}
    >
      <p>{t("intro")}</p>
      {/* Padding in px (UX, 20 Nov, #410's CI): px-5 in rem was 60 px a side at 300 %, leaving "SUPPRIMER," no line. */}
      <p className="rounded-2xl border border-border bg-surface px-[20px] py-[16px] font-medium text-text">{t("steps")}</p>
      <p>{t("what")}</p>
      {backupDays !== null && <p data-testid="backups-line">{t("backups", { days: backupDays })}</p>}
      <p>
        {t.rich("noAccess", {
          email: SUPPORT_EMAIL,
          // The tag holds only {email} in every language: the address, breaking only after its "@" (UX, 20 Nov).
          support: () => (
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-accent underline underline-offset-4">
              <SupportAddress />
            </a>
          ),
        })}
      </p>
    </PageShell>
  );
}
