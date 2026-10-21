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

// How long one data request (PostgREST: .rpc / .from) may take before it's
// given up (UX, the timeout audit): a dead connection otherwise waits on
// Node's 300 s defaults or Vercel's function limit. The full export reads
// everything, so it gets longer. Edge functions (/functions/v1/: reflect,
// report) aren't bounded here: they pass their own 45 s timeout.
export const DATA_DEADLINE_MS = 15_000;
export const EXPORT_DEADLINE_MS = 30_000;

export function dataDeadlineMs(url: string): number | null {
  if (!url.includes("/rest/v1/")) return null;
  return url.includes("/rpc/export_my_data") ? EXPORT_DEADLINE_MS : DATA_DEADLINE_MS;
}

const urlOf = (input: Parameters<typeof fetch>[0]) => (typeof input === "string" ? input : input instanceof URL ? input.href : input.url);

// fetch for a Supabase client that also stops at the Auth deadline, and a
// data request at its own deadline. A timed-out request rejects with an
// AbortError, the one error postgrest-js answers as { error } without
// retrying (a TimeoutError would be retried 3 more times, 1 + 2 + 4 s apart).
export function fetchUntil(signal: AbortSignal): typeof fetch {
  return async (input, init) => {
    const ms = dataDeadlineMs(urlOf(input));
    const own = ms === null ? null : new AbortController();
    // Left running after the headers arrive, so a body that stalls is cut
    // too (aborting a finished request does nothing); unref'd, so it never
    // keeps a function alive.
    const timer = own ? setTimeout(() => own.abort(new DOMException("Supabase didn't answer in time", "AbortError")), ms!) : undefined;
    (timer as { unref?: () => void } | undefined)?.unref?.();
    const signals = [signal, init?.signal, own?.signal].filter((s): s is AbortSignal => !!s);
    try {
      return await fetch(input, { ...init, signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals) });
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  };
}
