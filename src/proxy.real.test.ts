// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// The proxy's sign-out decisions against the REAL @supabase/ssr + auth-js,
// with Supabase Auth (GoTrue) replaced by a stubbed fetch that answers like
// the real server. Mocking getUser() hid the real path: auth-js turns a 403
// session_not_found into an AuthSessionMissingError with no code (Web
// Tester's repro on #10: a global sign-out elsewhere showed no notice).
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://teststub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
process.env.NEXT_PUBLIC_SHOW_DRAFTS = "1";

// supabase-js's default storage key: sb-<first host label>-auth-token.
const COOKIE = "sb-teststub-auth-token";

vi.mock("next-intl/middleware", () => ({
  default: () => (req: NextRequest) => NextResponse.next({ request: { headers: new Headers(req.headers) } }),
}));

const { default: proxy } = await import("./proxy");

const b64url = (s: string) => Buffer.from(s).toString("base64url");
function sessionCookie({ expired }: { expired: boolean }): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = expired ? now - 600 : now + 3600;
  const jwt = [
    b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    b64url(JSON.stringify({ sub: "u1", exp, session_id: "s1", role: "authenticated", aud: "authenticated" })),
    "c2ln",
  ].join(".");
  const session = {
    access_token: jwt,
    refresh_token: "refresh-1",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user: { id: "u1", aud: "authenticated", role: "authenticated", email: "x@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" },
  };
  return `base64-${b64url(JSON.stringify(session))}`;
}

type Answer = { status: number; body?: unknown };
let userAnswer: Answer;
let refreshAnswer: Answer;
// Like real GoTrue: auth-js only reads body.code when this version header
// is present (lib/fetch.js handleError).
const json = ({ status, body }: Answer) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-supabase-api-version": "2024-01-01" },
  });

beforeEach(() => {
  userAnswer = { status: 200, body: { id: "u1", aud: "authenticated", role: "authenticated", email: "x@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" } };
  refreshAnswer = { status: 500, body: { code: "unexpected_failure", message: "not expected in this test" } };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) return json(userAnswer);
    if (url.includes("/auth/v1/token")) return json(refreshAnswer);
    throw new Error(`unexpected fetch ${url}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

const visit = (path: string, cookie?: string) =>
  proxy(new NextRequest(`https://www.moodbow.com${path}`, { headers: cookie ? { cookie: `${COOKIE}=${cookie}` } : {} }));
const clearsAuthCookie = (res: Response) => (res.headers.get("set-cookie") ?? "").includes(`${COOKIE}=;`);

describe("proxy + real auth-js: why a session ended", () => {
  it("a revoked session (global sign-out elsewhere): 403 session_not_found → the session-ended notice", async () => {
    userAnswer = { status: 403, body: { code: "session_not_found", message: "Session from session_id claim in JWT does not exist" } };
    const res = await visit("/app/me", sessionCookie({ expired: false }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://www.moodbow.com/sign-in?signed_out=session");
    expect(clearsAuthCookie(res)).toBe(true);
  });

  it("an expired token whose refresh token was revoked: 400 refresh_token_not_found → the session-ended notice", async () => {
    refreshAnswer = { status: 400, body: { code: "refresh_token_not_found", message: "Invalid Refresh Token: Refresh Token Not Found" } };
    const res = await visit("/app", sessionCookie({ expired: true }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://www.moodbow.com/sign-in?signed_out=session");
    expect(clearsAuthCookie(res)).toBe(true);
  });

  it("a deleted account: 403 user_not_found → the account-gone notice", async () => {
    userAnswer = { status: 403, body: { code: "user_not_found", message: "User from sub claim in JWT does not exist" } };
    const res = await visit("/app/timeline", sessionCookie({ expired: false }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://www.moodbow.com/sign-in?signed_out=account");
    expect(clearsAuthCookie(res)).toBe(true);
  });

  it("an auth outage (503) changes nothing: no redirect, no cookie deletion", async () => {
    userAnswer = { status: 503, body: { message: "upstream unavailable" } };
    const res = await visit("/app", sessionCookie({ expired: false }));
    expect(res.status).toBe(200);
    expect(clearsAuthCookie(res)).toBe(false);
  });

  it("no session cookie at all: no notice (an ordinary signed-out visit)", async () => {
    const res = await visit("/app");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("a valid session passes through", async () => {
    const res = await visit("/app", sessionCookie({ expired: false }));
    expect(res.status).toBe(200);
    expect(clearsAuthCookie(res)).toBe(false);
  });
});

// A form on a signed-in page posts a server action; when Supabase ended the
// session, the answer must be one Next's action client understands (Web
// Tester, #12: a page redirect left the editor on its generic error).
describe("proxy + real auth-js: a server action after the session ended", () => {
  const act = (path: string, cookie: string) =>
    proxy(new NextRequest(`https://www.moodbow.com${path}`, { method: "POST", headers: { cookie: `${COOKIE}=${cookie}`, "next-action": "abc123" } }));

  it("revoked: an action redirect to sign-in with the notice, not a page redirect; cookies cleared", async () => {
    userAnswer = { status: 403, body: { code: "session_not_found", message: "Session from session_id claim in JWT does not exist" } };
    const res = await act("/app/write", sessionCookie({ expired: false }));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-action-redirect")).toBe("/sign-in?signed_out=session;replace");
    expect(clearsAuthCookie(res)).toBe(true);
  });

  it("deleted elsewhere: the account notice", async () => {
    userAnswer = { status: 403, body: { code: "user_not_found", message: "User from sub claim in JWT does not exist" } };
    const res = await act("/app", sessionCookie({ expired: false }));
    expect(res.headers.get("x-action-redirect")).toBe("/sign-in?signed_out=account;replace");
  });

  it("a page request still gets the 303", async () => {
    userAnswer = { status: 403, body: { code: "session_not_found", message: "x" } };
    const res = await visit("/app/write", sessionCookie({ expired: false }));
    expect(res.status).toBe(303);
    expect(res.headers.get("x-action-redirect")).toBeNull();
  });
});
