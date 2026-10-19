// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAuthOutage } from "./proxy";

// The server client's auth.getUser() is bounded: at most 10 s, and at once
// when the proxy already timed out on this request.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://teststub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

const requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
  headers: async () => requestHeaders,
}));
const getUser = vi.fn();
const getSession = vi.fn();
const others = Object.fromEntries(["signInWithPassword", "signUp", "resend", "verifyOtp", "updateUser", "resetPasswordForEmail", "signOut"].map((m) => [m, vi.fn()]));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser, getSession, ...others } }) }));

const { createSupabaseServerClient } = await import("./server");

beforeEach(() => {
  getUser.mockReset();
  requestHeaders.delete("x-mb-auth-outage");
});
afterEach(() => vi.useRealTimers());

describe("createSupabaseServerClient: auth.getUser() within the deadline", () => {
  it("answers in time: the real answer", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const client = (await createSupabaseServerClient())!;
    expect(await client.auth.getUser()).toEqual({ data: { user: { id: "u1" } }, error: null });
  });

  it("no answer: after 10 s an outage (user null, a retryable error), never a sign-out", async () => {
    vi.useFakeTimers();
    getUser.mockReturnValue(new Promise(() => {}));
    const client = (await createSupabaseServerClient())!;
    const pending = client.auth.getUser();
    await vi.advanceTimersByTimeAsync(10_000);
    const { data, error } = await pending;
    expect(data.user).toBeNull();
    expect(isAuthOutage(error)).toBe(true);
  });

  it("the proxy already timed out: answers at once without asking Auth again", async () => {
    requestHeaders.set("x-mb-auth-outage", "1");
    const client = (await createSupabaseServerClient())!;
    const { data, error } = await client.auth.getUser();
    expect(data.user).toBeNull();
    expect(isAuthOutage(error)).toBe(true);
    expect(getUser).not.toHaveBeenCalled();
  });
});
