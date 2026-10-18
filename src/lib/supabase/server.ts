import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { AUTH_OUTAGE_HEADER, deadlineAbort, deadlineError, fetchUntil, startDeadline } from "./deadline";

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

// The session cookie: sb-<project ref>-auth-token, possibly split into
// chunks (.0, .1, …) by @supabase/ssr.
const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

type CookieStore = Awaited<ReturnType<typeof cookies>>;

// Deletes this browser's session cookies directly. Only server actions and
// route handlers may set cookies; elsewhere this does nothing.
export function clearSessionCookies(store: CookieStore): void {
  for (const { name } of store.getAll()) {
    if (!AUTH_COOKIE.test(name)) continue;
    try {
      store.set(name, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
    } catch {
      // a server component: the proxy or the next action clears it
    }
  }
}

// null when the env vars are missing (local builds, CI): callers fail
// closed (an auth link shows "expired", a form shows the generic error).
//
// Supabase Auth is never waited on longer than AUTH_DEADLINE_MS, and not at
// all when the proxy already ran out of time on this request (an outage:
// pages show "Something went wrong" + Try again, and nobody is signed out).
// Every page and action gets this by using this client:
// - auth.getUser() returns an AuthRetryableFetchError past the deadline;
// - auth.getSession(), which every .rpc() / .from() calls for its token
//   (and which refreshes an expired one), THROWS an AbortError: a null
//   session would send the request with the anon key, answer
//   not_authenticated, and look like a sign-out. postgrest-js turns the
//   abort into an { error } (the generic message) without retrying, so a
//   data call fails fast instead.
export async function createSupabaseServerClient() {
  const config = supabaseConfig();
  if (!config) return null;
  const store = await cookies();
  let outage = (await headers()).get(AUTH_OUTAGE_HEADER) === "1";
  // Aborts what's still running once a deadline passes.
  const abort = new AbortController();
  const client = createServerClient(config.url, config.key, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    global: { fetch: fetchUntil(abort.signal) },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // A late refresh after a deadline must not change the session.
        if (outage) return;
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components can't set cookies; the proxy or the next
          // route handler / server action refreshes them instead.
        }
      },
    },
  });

  // Runs an Auth call within the deadline; undefined when it ran out (and
  // from then on, every Auth call on this client answers at once).
  async function bounded<T>(call: () => Promise<T>): Promise<T | undefined> {
    if (outage) return undefined;
    const deadline = startDeadline();
    try {
      const result = await Promise.race([call(), deadline.expired]);
      if (result !== "expired") return result as T;
      outage = true;
      abort.abort();
      return undefined;
    } finally {
      deadline.clear();
    }
  }

  const getUser = client.auth.getUser.bind(client.auth);
  client.auth.getUser = async (jwt?: string) => (await bounded(() => getUser(jwt))) ?? { data: { user: null }, error: deadlineError() };
  const getSession = client.auth.getSession.bind(client.auth);
  client.auth.getSession = async () => {
    const result = await bounded(getSession);
    if (!result) throw deadlineAbort();
    return result;
  };

  // The auth forms' calls (sign in, sign up, resend, password reset, the
  // email links): past the deadline they answer like Auth being down, so
  // each form shows its generic error with Try again (spec, line 88)
  // instead of waiting on auth-js's retries.
  const auth = client.auth;
  const timedOut = () => ({ data: { user: null, session: null }, error: deadlineError() }) as const;
  const signInWithPassword = auth.signInWithPassword.bind(auth);
  auth.signInWithPassword = async (credentials) => (await bounded(() => signInWithPassword(credentials))) ?? timedOut();
  const signUp = auth.signUp.bind(auth);
  auth.signUp = async (credentials) => (await bounded(() => signUp(credentials))) ?? timedOut();
  const resend = auth.resend.bind(auth);
  auth.resend = async (credentials) => (await bounded(() => resend(credentials))) ?? timedOut();
  const verifyOtp = auth.verifyOtp.bind(auth);
  auth.verifyOtp = async (params) => (await bounded(() => verifyOtp(params))) ?? timedOut();
  const updateUser = auth.updateUser.bind(auth);
  auth.updateUser = async (attributes, options) => (await bounded(() => updateUser(attributes, options))) ?? { data: { user: null }, error: deadlineError() };
  const resetPasswordForEmail = auth.resetPasswordForEmail.bind(auth);
  auth.resetPasswordForEmail = async (email, options) => (await bounded(() => resetPasswordForEmail(email, options))) ?? { data: null, error: deadlineError() };
  // A sign-out always ends the session in THIS browser, whatever Auth says:
  // auth-js keeps the session when it can't reach Auth (it returns early on
  // a network error or a 5xx), and a timed-out or flagged call never gets
  // that far, but the person asked to be signed out here (a shared
  // computer). Revoking it server-side is best effort.
  const signOut = auth.signOut.bind(auth);
  auth.signOut = async (options) => {
    const result = (await bounded(() => signOut(options))) ?? { error: deadlineError() };
    clearSessionCookies(store);
    return result;
  };
  return client;
}
