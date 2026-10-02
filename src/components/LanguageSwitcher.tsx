"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// Links to the same page in each language. next-intl's Link with a locale
// also updates the NEXT_LOCALE cookie, so the choice sticks on later visits.
export function LanguageSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t("language")} className="flex items-center gap-1">
      {routing.locales.map((l) =>
        l === locale ? (
          <span key={l} aria-current="true" lang={l} className="inline-flex min-h-12 items-center px-3 font-medium text-text">
            {t(`languageNames.${l}`)}
          </span>
        ) : (
          <Link
            key={l}
            href={pathname}
            locale={l}
            lang={l}
            hrefLang={l}
            className="inline-flex min-h-12 items-center rounded-full px-3 font-medium text-accent underline-offset-4 hover:underline"
          >
            {t(`languageNames.${l}`)}
          </Link>
        ),
      )}
    </nav>
  );
}
