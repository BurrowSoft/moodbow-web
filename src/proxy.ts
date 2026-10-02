import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { isHiddenPage, pagePath } from "./lib/sitemapPages";
import { authCookieNames, needsSession, refreshSession, signedInOnly } from "./lib/supabase/proxy";

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

export default async function proxy(req: NextRequest) {
  const path = pagePath(req.nextUrl.pathname, routing.locales);
  // Gated pages that aren't live yet (content/conditions.json) are 404s on
  // Production; drafts elsewhere render normally (pageGate).
  if (isHiddenPage(path)) {
    const url = req.nextUrl.clone();
    url.pathname = NOT_FOUND_PATH;
    return NextResponse.rewrite(url, { status: 404 });
  }
  // The signed-in area and the auth pages keep the Supabase session fresh:
  // refreshed first, so this request's server components already see the
  // new cookies (lib/supabase/proxy.ts), then saved on the response.
  const { cookies: refreshed, accountGone } = needsSession(path) ? await refreshSession(req) : { cookies: [], accountGone: false };

  // The account (or session) no longer exists, e.g. deleted on another
  // device: drop the stale session cookies everywhere, and send signed-in
  // pages to sign-in with the notice (never to Consent). A server error or
  // being offline doesn't count (lib/supabase/proxy.ts).
  if (accountGone) {
    const stale = authCookieNames(req);
    for (const name of stale) req.cookies.delete(name);
    let res: NextResponse;
    if (signedInOnly(path)) {
      const url = req.nextUrl.clone();
      const [, first = ""] = url.pathname.split("/");
      const prefix = (routing.locales as readonly string[]).includes(first) && first !== routing.defaultLocale ? `/${first}` : "";
      url.pathname = `${prefix}/sign-in`;
      url.search = "?signed_out=1";
      res = NextResponse.redirect(url, 303);
    } else {
      res = intl(req);
    }
    for (const name of stale) res.cookies.delete(name);
    return res;
  }

  const res = intl(req);
  for (const { name, value, options } of refreshed) res.cookies.set(name, value, options);
  return res;
}

export const config = {
  // Skip API routes, Next internals and any path with a dot (static files,
  // robots.txt, sitemap.xml, /.well-known/*).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
