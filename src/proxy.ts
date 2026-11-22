import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { conditionMet } from "./lib/conditions";
import { buildCsp, newNonce, NONCE_HEADER } from "./lib/csp";
import { canonicalEmailConfirmedSearch } from "./lib/authLink";
import { helpArticlePublished } from "./lib/helpGates";
import { isHiddenPage, pagePath } from "./lib/sitemapPages";
import { AUTH_OUTAGE_HEADER } from "./lib/supabase/deadline";
import { actionWithoutSession, authCookieNames, authCookieUid, needsSession, refreshSession, signedInOnly, WIPE_COOKIE, WIPE_COOKIE_OPTIONS } from "./lib/supabase/proxy";

// Locale routing (src/i18n/routing.ts): the default locale is unprefixed,
// others get /<locale>. With more than one locale, a first visit is matched
// to the browser language, and the NEXT_LOCALE cookie remembers a choice
// made in the language switcher.
const intl = createMiddleware(routing);

// An auth email's link carries its own language: send-email picks the email's words and the link's prefix from the
// same saved language, and English has none (moodbow-app emails.ts WEB_ROUTES). So an English email links to the
// unprefixed /auth/confirm, where detection would follow a NEXT_LOCALE cookie (or the browser's language) instead and
// redirect to /fr/auth/confirm: an English email opening a French page (the Mobile Dev, 20 Nov: Vitor's email change
// from app 1.4.0). On that path the link's language wins, with no detection. next-intl's cookie sync then resets a stale
// NEXT_LOCALE to the page's language, so the confirm's unprefixed next page stays in it too. A prefixed link
// (/fr/auth/confirm) was never affected: the prefix comes first.
const intlByLink = createMiddleware({ ...routing, localeDetection: false });
const LINK_LANGUAGE_PATHS = new Set(["/auth/confirm"]);
const localeMiddleware = (req: NextRequest) => (LINK_LANGUAGE_PATHS.has(req.nextUrl.pathname) ? intlByLink : intl);

// Where hidden pages are sent: a path under a real locale that no route
// matches, so Next serves the server-rendered app/not-found.tsx with a 404.
// (A notFound() thrown inside the [locale] tree gets Next's bare error shell
// instead: no <h1>, no lang until JS runs.)
const NOT_FOUND_PATH = `/${routing.defaultLocale}/_not-found-page`;

// The Content-Security-Policy (lib/csp.ts), with a fresh nonce for every
// page: on the request, where Next and the layout read it, and on every
// response this proxy returns. Enforced once "csp-enforced" is met (Report-Only before).
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
  // The app's Me → Help & FAQ opens /<language>/help, and its legal links
  // /<language>/privacy and so on (moodbow-app lib/core/policy.dart). Until a
  // language is served on this build, the app's /<language>/help…, /privacy,
  // /terms and /account-deletion go to the same English page, not a 404
  // (decision 212). /support too, though the app doesn't link it: someone looking
  // for support never gets a 404 (UX). The app's Portuguese is "pt" (UX), the web's route /pt-br.
  const appLink = req.nextUrl.pathname.match(/^\/(th|fr|es|pt|pt-br|de|it)(\/(?:help(?:\/.*)?|support|privacy(?:\/next)?|terms|consumer-health-data|account-deletion|security))\/?$/i);
  if (appLink) {
    const language = appLink[1].toLowerCase();
    const route = language === "pt" ? "pt-br" : language;
    const served = (routing.locales as readonly string[]).includes(route);
    if (!served || route !== language) {
      const url = req.nextUrl.clone();
      url.pathname = served ? `/${route}${appLink[2]}` : appLink[2];
      return withCsp(NextResponse.redirect(url, 307));
    }
  }
  // A Help article's address is lowercase (content/help slugs): /help/Tags, /es/HELP/Tags/ go to
  // /help/tags and /es/help/tags/ with a 308, keeping the language prefix and the query (UX, 15 Nov).
  const helpCase = req.nextUrl.pathname.match(/^(\/[^/]+)?(\/help\/[^/]+\/?)$/i);
  if (helpCase && /[A-Z]/.test(helpCase[2]) && (!helpCase[1] || (routing.locales as readonly string[]).some((l) => l.toLowerCase() === helpCase[1].slice(1).toLowerCase()))) {
    const url = req.nextUrl.clone();
    url.pathname = `${helpCase[1] ?? ""}${helpCase[2].toLowerCase()}`;
    return withCsp(NextResponse.redirect(url, 308));
  }
  const path = pagePath(req.nextUrl.pathname, routing.locales);
  // Gated pages that aren't live yet (content/conditions.json) are 404s on
  // Production; drafts elsewhere render normally (pageGate).
  // A Help article that's missing or not out yet (nothing left once its unmet blocks go): the
  // same routing-level 404, so the not-found page renders with its title and h1 (the Web Tester,
  // 15 Nov). The page's own notFound() would get the bare error shell.
  const helpSlug = path.match(/^\/help\/([^/]+)\/?$/)?.[1];
  const firstSegment = req.nextUrl.pathname.split("/")[1]?.toLowerCase() ?? "";
  const requestLocale = (routing.locales as readonly string[]).find((l) => l.toLowerCase() === firstSegment) ?? routing.defaultLocale;
  if (isHiddenPage(path) || (helpSlug !== undefined && !helpArticlePublished(requestLocale, helpSlug))) {
    const url = req.nextUrl.clone();
    url.pathname = NOT_FOUND_PATH;
    // The not-found page renders too: it needs this request's nonce (reviewer #69).
    return withCsp(NextResponse.rewrite(url, { status: 404, request: { headers: req.headers } }));
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
  // An action from a signed-in page with no session cookie at all counts
  // as an ended session too (lib/supabase/proxy.ts, actionWithoutSession).
  const ended = signedOut ?? (actionWithoutSession(req, path) ? "session_ended" : null);
  if (ended) {
    const stale = authCookieNames(req);
    // Read before the session cookies are dropped below.
    const goneUid = ended === "account_gone" ? authCookieUid(req) : null;
    for (const name of stale) req.cookies.delete(name);
    let res: NextResponse;
    if (signedInOnly(path)) {
      const url = req.nextUrl.clone();
      const [, first = ""] = url.pathname.split("/");
      const prefix = (routing.locales as readonly string[]).includes(first) && first !== routing.defaultLocale ? `/${first}` : "";
      url.pathname = `${prefix}/sign-in`;
      url.search = `?signed_out=${ended === "account_gone" ? "account" : "session"}`;
      // A server action's request (a form on a signed-in page) can't follow
      // a page redirect: fetch would follow it to the sign-in HTML and Next
      // reports "an unexpected response" (the form shows its generic error,
      // or a check-in is kept as offline: Web Tester, #12). Answer it the way
      // Next answers an action that redirects, so the client navigates.
      res = req.headers.has("next-action")
        ? new NextResponse(null, { status: 200, headers: { "x-action-redirect": `${url.pathname}${url.search};replace`, "content-type": "text/plain" } })
        : NextResponse.redirect(url, 303);
    } else {
      res = localeMiddleware(req)(req);
    }
    for (const name of stale) res.cookies.delete(name);
    // A deleted account's health data must not stay in this browser either
    // (decisions 68 + 85): the next page wipes that uid's local copies. A
    // revoked session keeps them for when the same person signs back in
    // (decision 81).
    if (goneUid) res.cookies.set(WIPE_COOKIE, goneUid, WIPE_COOKIE_OPTIONS);
    return withCsp(res);
  }

  const res = localeMiddleware(req)(req);
  for (const { name, value, options } of refreshed) res.cookies.set(name, value, options);
  return withCsp(res);
}

export const config = {
  // Skip API routes, Next internals and any path with a dot (static files,
  // robots.txt, sitemap.xml, /.well-known/*).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
