import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_OPTIONS, supabaseConfig } from "./server";

// Paths that read the Supabase session (paths without the locale prefix).
// Only these pay for a session check; the marketing pages never do.
const SESSION_PATHS = ["/app", "/sign-in", "/forgot-password", "/auth/reset-password", "/consent", "/sign-up", "/setup"];
// Pages that only make sense signed in: a session for an account that no
// longer exists is sent from these to sign-in with the account-gone notice.
const SIGNED_IN_ONLY = ["/app", "/setup"];

const matches = (list: string[], path: string) => list.some((p) => path === p || path.startsWith(`${p}/`));

export function needsSession(path: string): boolean {
  return matches(SESSION_PATHS, path);
}

export function signedInOnly(path: string): boolean {
  return matches(SIGNED_IN_ONLY, path);
}

// Supabase Auth's answers that end this browser's session (same triggers as
// the app, decisions 68 + 70):
// - "account_gone": the user no longer exists (deleted on another device);
// - "session_ended": the account exists but this session was revoked
//   (e.g. signed out everywhere after a password reset).
// Anything else (a 5xx, a timeout, offline) must NOT sign anyone out.
export type SignedOutReason = "account_gone" | "session_ended";

// Careful: auth-js never hands back GoTrue's 403 "session_not_found" as a
// code. It converts it into an AuthSessionMissingError (no code) and clears
// the stored session itself (lib/fetch.js → _getUser). The same error also
// means "no session cookie at all", so it only counts as a revoked session
// when this request actually carried an auth cookie (Web Tester + reviewer,
// #10: a global sign-out elsewhere showed no notice).
export function signedOutReason(error: { code?: string; name?: string } | null, hadSession: boolean): SignedOutReason | null {
  if (!error) return null;
  if (error.code === "user_not_found") return "account_gone";
  if (error.code === "session_not_found" || error.code === "refresh_token_not_found") return "session_ended";
  if (error.name === "AuthSessionMissingError" && hadSession) return "session_ended";
  return null;
}

// An auth outage (network failure, timeout, a 5xx from Supabase Auth): the
// session may be fine, so pages show an error state, never a sign-out.
export function isAuthOutage(error: { name?: string; status?: number } | null): boolean {
  if (!error) return false;
  return error.name === "AuthRetryableFetchError" || (typeof error.status === "number" && (error.status === 0 || error.status >= 500));
}

// The session cookie: sb-<project ref>-auth-token, possibly split into
// chunks (.0, .1, …) by @supabase/ssr.
const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

export function authCookieNames(req: NextRequest): string[] {
  return req.cookies
    .getAll()
    .map((c) => c.name)
    .filter((name) => AUTH_COOKIE.test(name));
}

export type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Refreshes the session BEFORE the response is built (@supabase/ssr's
// middleware pattern, adapted to next-intl):
// - the refreshed cookies are written onto the request, so the response
//   next-intl builds forwards them to the server components of this same
//   request (it copies request.headers into NextResponse.next/rewrite);
// - they're returned so the proxy also sets them on that response, saving
//   them in the browser.
// Without this, server components would read the old access token and
// refresh again with an already-rotated refresh token.
// signedOut: why Supabase ended this session, if it did (see above).
export async function refreshSession(req: NextRequest): Promise<{ cookies: CookieToSet[]; signedOut: SignedOutReason | null }> {
  const config = supabaseConfig();
  if (!config) return { cookies: [], signedOut: null };
  // Read before getUser(), which may clear the session cookies itself.
  const hadSession = authCookieNames(req).length > 0;
  let toSet: CookieToSet[] = [];
  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        toSet = list;
      },
    },
  });
  // Validates the JWT with Supabase and refreshes it when expired.
  const { error } = await supabase.auth.getUser();
  return { cookies: toSet, signedOut: signedOutReason(error, hadSession) };
}
