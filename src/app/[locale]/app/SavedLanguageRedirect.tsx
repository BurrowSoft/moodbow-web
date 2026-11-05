"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { goToLanguage, mayMoveTo } from "@/lib/savedLanguage";

// The same page in the person's saved language (the /app layout decides;
// lib/savedLanguage.ts says why it's a full page load). Normally only for that
// moment. If it has just tried and come back here (the cookie couldn't be
// written: a privacy extension, a full jar), it stays with the link, and never
// reloads in a loop (Reviewer, #179).
export function SavedLanguageRedirect({ locale }: { locale: string }) {
  const t = useTranslations("common");
  const pathname = usePathname();
  useEffect(() => {
    if (mayMoveTo(locale)) goToLanguage(locale, `${pathname}${window.location.search}`);
  }, [locale, pathname]);
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center" data-testid="saved-language-redirect">
      {/* A plain link, a full page load, always with the language in the
          address (/en/app too): the proxy then sets the cookie itself, which a
          script couldn't, and an unprefixed /app would be sent straight back. */}
      <a href={`/${locale}${pathname}`} lang={locale} data-testid="saved-language-link" className="inline-flex min-h-12 items-center px-3 font-medium text-accent underline underline-offset-4">
        {t(`languageNames.${locale}` as "languageNames.en")}
      </a>
    </main>
  );
}
