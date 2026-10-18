import { AuthRetryableFetchError } from "@supabase/supabase-js";

// How long a page waits for Supabase Auth (UX, after the Web Tester's #10
// outage check). With an expired session and Auth down, auth-js keeps
// retrying the refresh with backoff for ~50 s; past this deadline the page
// stops waiting and shows the outage state (Try again). The session is
// kept: an outage never signs anyone out.
export const AUTH_DEADLINE_MS = 10_000;

// Set by the proxy on the request when its own session check ran out of
// time, so the server components don't wait all over again. Stripped from
// every incoming request (a visitor can't set it; and if they could, they'd
// only see the outage state themselves).
export const AUTH_OUTAGE_HEADER = "x-mb-auth-outage";

// What a timed-out check looks like to callers: the same as Auth being
// unreachable (lib/supabase/proxy.ts isAuthOutage).
export const deadlineError = () => new AuthRetryableFetchError("Supabase Auth didn't answer in time", 0);

// What a data call (.rpc / .from) gets when its token can't be had in time:
// an AbortError, which postgrest-js treats as a timeout. It answers
// { error } at once; any other error makes it retry a GET 3 times with
// backoff (1 + 2 + 4 s), the very wait this cuts short.
export const deadlineAbort = () => new DOMException("Supabase Auth didn't answer in time", "AbortError");

export type Deadline = { signal: AbortSignal; expired: Promise<"expired">; clear: () => void };

// A deadline: `expired` resolves when it passes, and `signal` aborts the
// requests still running then (so auth-js's retries stop early too).
export function startDeadline(ms = AUTH_DEADLINE_MS): Deadline {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<"expired">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("expired");
    }, ms);
  });
  return { signal: controller.signal, expired, clear: () => clearTimeout(timer) };
}

// fetch for a Supabase client that also stops at the deadline.
export function fetchUntil(signal: AbortSignal): typeof fetch {
  return (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal });
}
