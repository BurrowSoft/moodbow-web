import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase from server components, route handlers and server actions
// (@supabase/ssr, session in cookies). Each deployment talks to its own
// project: Vercel sets these per environment (Production → prod,
// Preview → staging). The publishable key is public by design; RLS and
// the RPCs enforce access. No service-role key is ever used on the web.
export function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

// The auth cookies. httpOnly: nothing in the browser reads them (there's no
// browser-side Supabase client; every call runs on the server). secure on
// Vercel (https), not on localhost.
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

// null when the env vars are missing (local builds, CI): callers fail
// closed (an auth link shows "expired", a form shows the generic error).
export async function createSupabaseServerClient() {
  const config = supabaseConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components can't set cookies; the proxy or the next
          // route handler / server action refreshes them instead.
        }
      },
    },
  });
}
