import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { conditionMet } from "./lib/conditions";
import { buildCsp, newNonce, NONCE_HEADER } from "./lib/csp";
import { canonicalEmailConfirmedSearch } from "./lib/authLink";
import { isHiddenPage, pagePath } from "./lib/sitemapPages";
import { AUTH_OUTAGE_HEADER } from "./lib/supabase/deadline";
import { authCookieNames, authCookieUid, needsSession, refreshSession, signedInOnly, WIPE_COOKIE, WIPE_COOKIE_OPTIONS } from "./lib/supabase/proxy";

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

// The Content-Security-Policy (lib/csp.ts), with a fresh nonce for every
// page: on the request, where Next and the layout read it, and on every
// response this proxy returns. Report-Only until "csp-enforced" is met.
const CSP_HEADER = conditionMet("csp-enforced") ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

export default async function proxy(req: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp(nonce, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN, vercelEnv: process.env.VERCEL_ENV });
  req.headers.set(NONCE_HEADER, nonce);
  req.headers.set(CSP_HEADER, csp);
  const withCsp = (res: NextResponse) => {
    res.headers.set(CSP_HEADER, csp);
    return res;
  };
  const path = pagePath(req.nextUrl.pathname, routing.locales);
  // Gated pages that aren't live yet (content/conditions.json) are 404s on
  // Production; drafts elsewhere render normally (pageGate).
  if (isHiddenPage(path)) {
    const url = req.nextUrl.clone();
    url.pathname = NOT_FOUND_PATH;
    return withCsp(NextResponse.rewrite(url, { status: 404 }));
  }
  // /email-confirmed keeps only ?result= (lib/authLink.ts): a code or error
  // details in the address are dropped before the page renders.
  if (path === "/email-confirmed" && req.method === "GET" && req.nextUrl.search) {
    const search = canonicalEmailConfirmedSearch(req.nextUrl.search);
    if (search !== req.nextUrl.search) {
      const url = req.nextUrl.clone();
      url.search = search;
      return withCsp(NextResponse.redirect(url, 307));
    }
  }
  // The signed-in area and the auth pages keep the Supabase session fresh:
  // refreshed first, so this request's server components already see the
  // new cookies (lib/supabase/proxy.ts), then saved on the response.
  // Only the proxy may say Auth timed out on this request (lib/supabase/deadline.ts).
  req.headers.delete(AUTH_OUTAGE_HEADER);
  const { cookies: refreshed, signedOut, outage } = needsSession(path) ? await refreshSession(req) : { cookies: [], signedOut: null, outage: false };
  // Auth didn't answer in time: the session stays as it is, and the server
  // components show the outage state without waiting again.
  if (outage) req.headers.set(AUTH_OUTAGE_HEADER, "1");

  // Supabase ended this session: the account was deleted on another device
  // (decision 68) or the session was revoked (decision 70). Drop the stale
  // session cookies everywhere, and send signed-in pages to sign-in with the
  // matching notice (never to Consent). A server error or being offline
  // doesn't count (lib/supabase/proxy.ts).
  if (signedOut) {
    const stale = authCookieNames(req);
    // Read before the session cookies are dropped below.
    const goneUid = signedOut === "account_gone" ? authCookieUid(req) : null;
    for (const name of stale) req.cookies.delete(name);
    let res: NextResponse;
    if (signedInOnly(path)) {
      const url = req.nextUrl.clone();
      const [, first = ""] = url.pathname.split("/");
      const prefix = (routing.locales as readonly string[]).includes(first) && first !== routing.defaultLocale ? `/${first}` : "";
      url.pathname = `${prefix}/sign-in`;
      url.search = `?signed_out=${signedOut === "account_gone" ? "account" : "session"}`;
      // A server action's request (a form on a signed-in page) can't follow
      // a page redirect: fetch would follow it to the sign-in HTML and Next
      // reports "an unexpected response" (the form shows its generic error,
      // or a check-in is kept as offline: Web Tester, #12). Answer it the way
      // Next answers an action that redirects, so the client navigates.
      res = req.headers.has("next-action")
        ? new NextResponse(null, { status: 200, headers: { "x-action-redirect": `${url.pathname}${url.search};replace`, "content-type": "text/plain" } })
        : NextResponse.redirect(url, 303);
    } else {
      res = intl(req);
    }
    for (const name of stale) res.cookies.delete(name);
    // A deleted account's health data must not stay in this browser either
    // (decisions 68 + 85): the next page wipes that uid's local copies. A
    // revoked session keeps them for when the same person signs back in
    // (decision 81).
    if (goneUid) res.cookies.set(WIPE_COOKIE, goneUid, WIPE_COOKIE_OPTIONS);
    return withCsp(res);
  }

  const res = intl(req);
  for (const { name, value, options } of refreshed) res.cookies.set(name, value, options);
  return withCsp(res);
}

export const config = {
  // Skip API routes, Next internals and any path with a dot (static files,
  // robots.txt, sitemap.xml, /.well-known/*).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
