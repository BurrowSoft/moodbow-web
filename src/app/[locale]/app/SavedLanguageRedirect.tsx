"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { goToLanguage, languageUrl, mayMoveTo } from "@/lib/savedLanguage";

// The same page in the person's saved language (the /app layout decides;
// lib/savedLanguage.ts says why it's a full page load). Only for that moment,
// unless it has just tried and come back here (the cookie couldn't be written:
// a privacy extension, a full jar): then it stops, with a plain link, and never
// reloads in a loop (Reviewer, #179).
export function SavedLanguageRedirect({ locale }: { locale: string }) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (mayMoveTo(locale)) goToLanguage(locale, `${pathname}${window.location.search}`);
    else setStuck(true);
  }, [locale, pathname]);
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center" data-testid="saved-language-redirect">
      {stuck && (
        // A plain link, a full page load: the router must not cache this page.
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a href={languageUrl(locale, pathname)} lang={locale} data-testid="saved-language-link" className="inline-flex min-h-12 items-center px-3 font-medium text-accent underline underline-offset-4">
          {t(`languageNames.${locale}` as "languageNames.en")}
        </a>
      )}
    </main>
  );
}
