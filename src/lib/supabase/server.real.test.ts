// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The server client against the REAL @supabase/ssr + supabase-js + auth-js,
// with Supabase replaced by a stubbed fetch. Every .rpc() / .from() gets its
// token from auth.getSession(), which refreshes an expired one with retries
// (Code Reviewer, #14): with Auth hanging, a data call must still settle by
// the 10 s deadline, as an error, and never go out with the anon key.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://teststub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

const COOKIE = "sb-teststub-auth-token";
const b64url = (s: string) => Buffer.from(s).toString("base64url");
function expiredSessionCookie(): string {
  const exp = Math.floor(Date.now() / 1000) - 600;
  const jwt = [b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })), b64url(JSON.stringify({ sub: "u1", exp, role: "authenticated" })), "c2ln"].join(".");
  const session = { access_token: jwt, refresh_token: "refresh-1", token_type: "bearer", expires_in: 3600, expires_at: exp, user: { id: "u1", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" } };
  return `base64-${b64url(JSON.stringify(session))}`;
}

const requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [{ name: COOKIE, value: expiredSessionCookie() }], set: () => {} }),
  headers: async () => requestHeaders,
}));

const { createSupabaseServerClient } = await import("./server");

type Call = { url: string; auth: string | null };
let calls: Call[];
beforeEach(() => {
  calls = [];
  requestHeaders.delete("x-mb-auth-outage");
  vi.useFakeTimers();
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    if (url.includes("/rest/v1/")) return Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    // Auth (the token refresh) never answers, but stops when aborted.
    return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("server client + real SDK: data calls while Auth hangs", () => {
  it("an rpc with an expired session settles by 10 s as an error, and never goes out with the anon key", async () => {
    const client = (await createSupabaseServerClient())!;
    let settled = false;
    const pending = client.rpc("get_me").then((r) => ((settled = true), r));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const { data, error } = await pending;
    expect(data).toBeNull();
    expect(error?.message).toContain("didn't answer in time");
    expect(calls.some((c) => c.url.includes("/auth/v1/token"))).toBe(true);
    expect(calls.filter((c) => c.url.includes("/rest/v1/"))).toEqual([]);
  });

  it("after one deadline, the next calls on that client answer at once", async () => {
    const client = (await createSupabaseServerClient())!;
    // .then() starts it: a query builder only sends when awaited.
    const first = client.rpc("get_me").then((r) => r);
    await vi.advanceTimersByTimeAsync(10_000);
    await first;
    const before = calls.length;
    const { error } = await client.from("check_ins").select("mood").maybeSingle();
    expect(error?.message).toContain("didn't answer in time");
    const user = await client.auth.getUser();
    expect(user.data.user).toBeNull();
    expect(calls.length).toBe(before);
  });

  it("flagged by the proxy: no request at all, an error at once", async () => {
    requestHeaders.set("x-mb-auth-outage", "1");
    const client = (await createSupabaseServerClient())!;
    const { error } = await client.rpc("get_me");
    expect(error?.message).toContain("didn't answer in time");
    expect(calls).toEqual([]);
  });
});

describe("server client + real SDK: the auth forms while Auth hangs", () => {
  it("sign-in settles by 10 s as an outage (the form's generic error), not after auth-js's retries", async () => {
    const client = (await createSupabaseServerClient())!;
    let settled = false;
    const pending = client.auth.signInWithPassword({ email: "a@b.co", password: "secret-123" }).then((r) => ((settled = true), r));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const { data, error } = await pending;
    expect(data.session).toBeNull();
    expect(error?.name).toBe("AuthRetryableFetchError");
    expect(calls.some((c) => c.url.includes("/auth/v1/token"))).toBe(true);
  });

  it("flagged by the proxy: every form call answers at once, nothing is sent", async () => {
    requestHeaders.set("x-mb-auth-outage", "1");
    const client = (await createSupabaseServerClient())!;
    const answers = await Promise.all([
      client.auth.signInWithPassword({ email: "a@b.co", password: "x" }),
      client.auth.signUp({ email: "a@b.co", password: "x" }),
      client.auth.resend({ type: "signup", email: "a@b.co" }),
      client.auth.resetPasswordForEmail("a@b.co"),
      client.auth.verifyOtp({ type: "signup", token_hash: "h" }),
      client.auth.updateUser({ password: "y" }),
      client.auth.signOut({ scope: "local" }),
    ]);
    for (const { error } of answers) expect(error?.name).toBe("AuthRetryableFetchError");
    expect(calls).toEqual([]);
  });
});
