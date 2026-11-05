"use client";

import { useEffect } from "react";
import { usePathname } from "@/i18n/navigation";
import { goToLanguage } from "@/lib/savedLanguage";

// The same page in the person's saved language (the /app layout decides;
// lib/savedLanguage.ts says why it's a full page load). Only for that moment.
export function SavedLanguageRedirect({ locale }: { locale: string }) {
  const pathname = usePathname();
  useEffect(() => {
    goToLanguage(locale, `${pathname}${window.location.search}`);
  }, [locale, pathname]);
  return <main id="main" className="min-h-dvh" data-testid="saved-language-redirect" />;
}
