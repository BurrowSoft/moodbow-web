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

// Supabase Auth's answers that mean "this account or session no longer
// exists" (deleted on another device, the session revoked). Same trigger as
// the app. Anything else (a 5xx, a timeout, offline) must NOT sign anyone
// out.
const GONE_CODES = new Set(["user_not_found", "session_not_found"]);

export function isAccountGone(error: { code?: string } | null): boolean {
  return !!error?.code && GONE_CODES.has(error.code);
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
// accountGone: Supabase says the user or session no longer exists.
export async function refreshSession(req: NextRequest): Promise<{ cookies: CookieToSet[]; accountGone: boolean }> {
  const config = supabaseConfig();
  if (!config) return { cookies: [], accountGone: false };
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
  return { cookies: toSet, accountGone: isAccountGone(error) };
}
