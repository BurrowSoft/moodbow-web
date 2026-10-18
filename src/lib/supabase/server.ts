import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { AUTH_OUTAGE_HEADER, deadlineError, startDeadline } from "./deadline";

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
//
// auth.getUser() never waits longer than AUTH_DEADLINE_MS, and answers at
// once when the proxy already ran out of time on this request: past that it
// returns an AuthRetryableFetchError (an outage: pages show "Something went
// wrong" + Try again, and nobody is signed out). Every page and action gets
// this by using this client.
export async function createSupabaseServerClient() {
  const config = supabaseConfig();
  if (!config) return null;
  const store = await cookies();
  const outage = (await headers()).get(AUTH_OUTAGE_HEADER) === "1";
  const client = createServerClient(config.url, config.key, {
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
  const getUser = client.auth.getUser.bind(client.auth);
  client.auth.getUser = async (jwt?: string) => {
    const timedOut = { data: { user: null }, error: deadlineError() } as const;
    if (outage) return timedOut;
    const deadline = startDeadline();
    try {
      const result = await Promise.race([getUser(jwt), deadline.expired]);
      return result === "expired" ? timedOut : result;
    } finally {
      deadline.clear();
    }
  };
  return client;
}
