import { routeLocale } from "@/i18n/routing";

// Inside the journal a signed-in person's saved language wins, if it's offered
// (row RT4, UX 2026-11-05). A route that isn't offered is a draft, reached by
// its address on a test build: it stays. Returns the route to move to, or null.
export function savedLanguageRoute(saved: string | null | undefined, route: string, offered: readonly string[]): string | null {
  if (!saved) return null;
  const target = routeLocale(saved);
  return target !== route && offered.includes(target) && offered.includes(route) ? target : null;
}

// English is unprefixed (routing: "as-needed").
export const languageUrl = (locale: string, path: string) => (locale === "en" ? path : `/${locale}${path}`);

// A language change inside the journal: the cookie first, then one full page
// load. Not a server redirect or a client navigation: the proxy matches an
// unprefixed address to the cookie or the browser, and only sets the cookie on
// document requests, so a French browser would bounce between /app and /fr/app
// (the blank page again, #173). A full load also starts with an empty router cache.
export function goToLanguage(locale: string, path: string, go: (url: string) => void = (url) => window.location.replace(url)): void {
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000; samesite=lax`;
  go(languageUrl(locale, path));
}
