import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_OPTIONS, supabaseConfig } from "./server";

// Paths that read the Supabase session (paths without the locale prefix).
// Only these pay for a session check; the marketing pages never do.
const SESSION_PATHS = ["/app", "/sign-in", "/forgot-password", "/auth/reset-password", "/consent", "/sign-up", "/setup"];

export function needsSession(path: string): boolean {
  return SESSION_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
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
export async function refreshSession(req: NextRequest): Promise<CookieToSet[]> {
  const config = supabaseConfig();
  if (!config) return [];
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
  await supabase.auth.getUser();
  return toSet;
}
