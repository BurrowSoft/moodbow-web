import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { conditionMet, pageGate } from "@/lib/conditions";
import { BURROWSOFT_URL } from "@/lib/site";
import { liveStores } from "@/lib/stores";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { TryAppButton } from "./TryAppButton";

const linkClass =
  "inline-flex min-h-12 max-w-full items-center rounded-full px-3 font-medium text-accent underline-offset-4 [overflow-wrap:anywhere] hover:underline";

export async function Footer() {
  const t = await getTranslations("common");
  // Only pages that are live are linked; drafts are reachable on Preview by
  // URL only (see pageGate).
  const links = [
    { href: "/support", label: t("support"), show: true },
    { href: "/privacy", label: t("privacy"), show: conditionMet("privacy-text-approved") },
    { href: "/terms", label: t("terms"), show: conditionMet("terms-text-approved") },
    // On every page, the journal too (RCW 19.373: any page collecting personal
    // information is a "homepage"). Never hide this footer on a page that asks for any.
    { href: "/consumer-health-data", label: t("consumerHealthData"), show: conditionMet("consumer-health-data-approved") },
    { href: "/account-deletion", label: t("accountDeletion"), show: conditionMet("delete-account-live") },
  ] as const;

  return (
    <footer className="px-6 pb-6 pt-10 text-sm text-muted print:hidden">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2">
        <TryAppButton journal={pageGate("web-journal-live") !== "hidden"} stores={liveStores()} />
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
