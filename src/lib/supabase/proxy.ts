import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_OPTIONS, supabaseConfig } from "./server";

// Paths that read the Supabase session (paths without the locale prefix).
// Only these pay for a session check; the marketing pages never do.
const SESSION_PATHS = ["/app", "/sign-in", "/forgot-password", "/auth/reset-password"];

export function needsSession(path: string): boolean {
  return SESSION_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

// Refreshes the auth cookies on the response the proxy is about to return
// (@supabase/ssr's middleware pattern). Server components can't write
// cookies, so a rotated refresh token is only saved here or in a server
// action / route handler. getUser() also validates the JWT with Supabase.
export async function refreshSession(req: NextRequest, res: NextResponse): Promise<void> {
  const config = supabaseConfig();
  if (!config) return;
  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
}
