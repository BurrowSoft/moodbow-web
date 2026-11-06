"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { offeredLocales } from "@/i18n/routing";

// Links to the same page in each language. next-intl's Link with a locale
// also updates the NEXT_LOCALE cookie, so the choice sticks on later visits.
export function LanguageSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  // Only offered languages (OFFER_GATE): a draft isn't listed, and with only
  // one language offered there's nothing to switch between.
  const locales = offeredLocales();
  if (locales.length < 2) return null;
  // In the journal the saved language decides, and Me → Language is the one
  // control: a link here would be sent straight back (UX 2026-11-05).
  if (pathname === "/app" || pathname.startsWith("/app/")) return null;

  return (
    <nav data-language-switcher aria-label={t("language")} className="flex max-w-full flex-wrap items-center justify-center gap-1">
      {locales.map((l) =>
        l === locale ? (
          <span key={l} aria-current="true" lang={l} className="inline-flex min-h-12 max-w-full items-center px-[12px] font-medium text-text">
            {t(`languageNames.${l}`)}
          </span>
        ) : (
          <Link
            key={l}
            href={pathname}
            locale={l}
            lang={l}
            hrefLang={l}
            className="inline-flex min-h-12 max-w-full items-center rounded-full px-[12px] font-medium text-accent underline-offset-4 hover:underline"
          >
            {t(`languageNames.${l}`)}
          </Link>
        ),
      )}
    </nav>
  );
}
