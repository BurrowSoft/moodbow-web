import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { isHiddenPage, pagePath } from "./lib/sitemapPages";

// Locale routing (src/i18n/routing.ts): the default locale is unprefixed,
// others get /<locale>. With more than one locale, a first visit is matched
// to the browser language, and the NEXT_LOCALE cookie remembers a choice
// made in the language switcher. English only for now.
const intl = createMiddleware(routing);

// Where hidden pages are sent: a path under a real locale that no route
// matches, so Next serves the server-rendered app/not-found.tsx with a 404.
// (A notFound() thrown inside the [locale] tree gets Next's bare error shell
// instead: no <h1>, no lang until JS runs.)
const NOT_FOUND_PATH = `/${routing.defaultLocale}/_not-found-page`;

export default function proxy(req: NextRequest) {
  // Gated pages that aren't live yet (content/conditions.json) are 404s on
  // Production; drafts elsewhere render normally (pageGate).
  if (isHiddenPage(pagePath(req.nextUrl.pathname, routing.locales))) {
    const url = req.nextUrl.clone();
    url.pathname = NOT_FOUND_PATH;
    return NextResponse.rewrite(url, { status: 404 });
  }
  return intl(req);
}

export const config = {
  // Skip API routes, Next internals and any path with a dot (static files,
  // robots.txt, sitemap.xml, /.well-known/*).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
