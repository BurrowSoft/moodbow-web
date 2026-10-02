import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { conditionMet } from "@/lib/conditions";
import { BURROWSOFT_URL } from "@/lib/site";
import { LanguageSwitcher } from "./LanguageSwitcher";

const linkClass =
  "inline-flex min-h-12 items-center rounded-full px-3 font-medium text-accent underline-offset-4 hover:underline";

export async function Footer() {
  const t = await getTranslations("common");
  // Only pages that are live are linked; drafts are reachable on Preview by
  // URL only (see pageGate).
  const links = [
    { href: "/support", label: t("support"), show: true },
    { href: "/privacy", label: t("privacy"), show: conditionMet("privacy-text-approved") },
    { href: "/terms", label: t("terms"), show: conditionMet("terms-text-approved") },
    { href: "/account-deletion", label: t("accountDeletion"), show: conditionMet("delete-account-live") },
  ] as const;

  return (
    <footer className="px-6 pb-6 pt-10 text-sm text-muted">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2">
        <nav aria-label={t("siteLinks")} className="flex flex-wrap items-center justify-center gap-x-1">
          {links
            .filter((l) => l.show)
            .map((l) => (
              <Link key={l.href} href={l.href} className={linkClass}>
                {l.label}
              </Link>
            ))}
        </nav>
        <LanguageSwitcher />
        <p className="flex flex-wrap items-center justify-center gap-x-1">
          <a href={BURROWSOFT_URL} aria-label={t("burrowsoftAria")} className={linkClass}>
            {t("burrowsoftProduct")}
          </a>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span className="px-3">{t("copyright")}</span>
        </p>
      </div>
    </footer>
  );
}
