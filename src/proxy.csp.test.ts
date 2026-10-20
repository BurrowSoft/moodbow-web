// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

// The proxy's CSP (lib/csp.ts): every response carries the policy, and the
// pages it lets render (the normal path and the 404 rewrite) get this
// request's nonce on the request headers Next renders with (reviewer #69).
let hidden = false;
vi.mock("./lib/sitemapPages", () => ({ isHiddenPage: () => hidden, pagePath: (p: string) => p }));
vi.mock("./lib/supabase/proxy", () => ({
  needsSession: () => false,
  refreshSession: async () => ({ cookies: [], signedOut: null, outage: false }),
  authCookieNames: () => [],
  authCookieUid: () => null,
  signedInOnly: () => false,
  WIPE_COOKIE: "mb_wipe",
  WIPE_COOKIE_OPTIONS: {},
}));
// next-intl's middleware passes the request's headers on, as Next's own does.
vi.mock("next-intl/middleware", () => ({ default: () => (req: NextRequest) => NextResponse.next({ request: { headers: req.headers } }) }));
const { default: proxy } = await import("./proxy");

const CSP = "content-security-policy-report-only";
const nonceOf = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1];

describe("proxy: the CSP nonce reaches the page that renders", () => {
  it("a normal page: the response has the policy, and the request Next renders with has the same nonce", async () => {
    hidden = false;
    const res = await proxy(new NextRequest("https://www.moodbow.com/support"));
    const nonce = nonceOf(res.headers.get(CSP));
    expect(nonce).toBeTruthy();
    // Next encodes the overridden request headers as x-middleware-request-*.
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(nonceOf(res.headers.get(`x-middleware-request-${CSP}`))).toBe(nonce);
  });

  it("a hidden page's 404 rewrite: the not-found page also gets the nonce", async () => {
    hidden = true;
    const res = await proxy(new NextRequest("https://www.moodbow.com/sign-in"));
    expect(res.status).toBe(404);
    expect(res.headers.get("x-middleware-rewrite")).toContain("/_not-found-page");
    const nonce = nonceOf(res.headers.get(CSP));
    expect(nonce).toBeTruthy();
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  });

  it("a fresh nonce per request", async () => {
    hidden = false;
    const a = nonceOf((await proxy(new NextRequest("https://www.moodbow.com/"))).headers.get(CSP));
    const b = nonceOf((await proxy(new NextRequest("https://www.moodbow.com/"))).headers.get(CSP));
    expect(a).not.toBe(b);
  });
});
