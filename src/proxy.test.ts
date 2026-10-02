// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// The proxy's session refresh order (reviewer, #5): an expired access token
// is refreshed BEFORE next-intl builds the response, so the server
// components of the same request already see the new cookie, and the
// response saves it in the browser.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging.example.invalid";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
// A test build, so the gated /app renders (it 404s on Production).
process.env.NEXT_PUBLIC_SHOW_DRAFTS = "1";

const COOKIE = "sb-test-auth-token";
let getUserCalls = 0;
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: { getAll: () => { name: string; value: string }[]; setAll: (list: unknown[]) => void } }) => ({
    auth: {
      getUser: async () => {
        getUserCalls++;
        // Supabase rotates an expired session: new cookie values.
        if (opts.cookies.getAll().some((c) => c.name === COOKIE && c.value === "EXPIRED")) {
          opts.cookies.setAll([{ name: COOKIE, value: "REFRESHED", options: { path: "/", httpOnly: true } }]);
        }
        return { data: { user: { id: "u" } }, error: null };
      },
    },
  }),
}));

// next-intl's middleware forwards request.headers into the response it
// builds; the stand-in records what it was given.
let seenByIntl: string | undefined;
vi.mock("next-intl/middleware", () => ({
  default: () => (req: NextRequest) => {
    seenByIntl = req.cookies.get(COOKIE)?.value;
    return NextResponse.next({ request: { headers: new Headers(req.headers) } });
  },
}));

const { default: proxy } = await import("./proxy");

beforeEach(() => {
  getUserCalls = 0;
  seenByIntl = undefined;
});

const request = (path: string, cookie?: string) =>
  new NextRequest(`https://www.moodbow.com${path}`, { headers: cookie ? { cookie: `${COOKIE}=${cookie}` } : {} });

describe("proxy session refresh", () => {
  it("expired token: one refresh, the new cookie reaches next-intl (and so the page) and the browser", async () => {
    const res = await proxy(request("/app", "EXPIRED"));
    expect(getUserCalls).toBe(1);
    expect(seenByIntl).toBe("REFRESHED");
    expect(res.cookies.get(COOKIE)?.value).toBe("REFRESHED");
  });

  it("a valid session passes through unchanged", async () => {
    const res = await proxy(request("/app/me", "VALID"));
    expect(seenByIntl).toBe("VALID");
    expect(res.cookies.get(COOKIE)).toBeUndefined();
  });

  it("marketing pages never touch Supabase", async () => {
    await proxy(request("/support", "EXPIRED"));
    expect(getUserCalls).toBe(0);
  });
});
