// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The app's own access token on a web endpoint (the payments audit, 14 Nov).
let getUser: (token: string) => Promise<{ data: { user: { id: string } | null }; error: { name: string; status?: number } | null }>;
const created: { key: string; headers: Record<string, string> }[] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string, opts: { global: { headers: Record<string, string> } }) => {
    created.push({ key, headers: opts.global.headers });
    return { auth: { getUser: (t: string) => getUser(t) } };
  },
}));
let config: { url: string; key: string } | null = { url: "https://abc.supabase.co", key: "pk_pub" };
vi.mock("./server", () => ({ supabaseConfig: () => config }));
const { bearerToken, bearerUser } = await import("./bearer");

const req = (authorization?: string) => new Request("https://moodbow.app/api/x", { method: "POST", headers: authorization ? { authorization } : {} });

beforeEach(() => {
  created.length = 0;
  config = { url: "https://abc.supabase.co", key: "pk_pub" };
  getUser = async () => ({ data: { user: { id: "u1" } }, error: null });
});

describe("bearerToken", () => {
  it("only a Bearer token, nothing else", () => {
    expect(bearerToken(req())).toBeNull();
    expect(bearerToken(req("Basic abc"))).toBeNull();
    expect(bearerToken(req("Bearer "))).toBeNull();
    expect(bearerToken(req("Bearer a b"))).toBeNull();
    expect(bearerToken(req("Bearer eyJhbGc.eyJzdWIi.sig_-1"))).toBe("eyJhbGc.eyJzdWIi.sig_-1");
    expect(bearerToken(req("bearer tok"))).toBe("tok");
  });
});

describe("bearerUser", () => {
  it("a valid token: the user, and a client that carries the token with the publishable key (never a service key)", async () => {
    const who = await bearerUser(req("Bearer tok"));
    expect(who).toMatchObject({ kind: "ok", uid: "u1" });
    expect(created).toEqual([{ key: "pk_pub", headers: { Authorization: "Bearer tok" } }]);
  });
  it("no token: missing, without asking Auth", async () => {
    expect(await bearerUser(req())).toEqual({ kind: "missing" });
    expect(created).toHaveLength(0);
  });
  it("a token Auth refuses: invalid", async () => {
    getUser = async () => ({ data: { user: null }, error: { name: "AuthApiError", status: 401 } });
    expect(await bearerUser(req("Bearer forged"))).toEqual({ kind: "invalid" });
  });
  it("Auth unreachable or erroring: outage, never read as signed out", async () => {
    getUser = async () => ({ data: { user: null }, error: { name: "AuthRetryableFetchError", status: 0 } });
    expect(await bearerUser(req("Bearer tok"))).toEqual({ kind: "outage" });
    getUser = async () => ({ data: { user: null }, error: { name: "AuthApiError", status: 502 } });
    expect(await bearerUser(req("Bearer tok"))).toEqual({ kind: "outage" });
    getUser = async () => {
      throw new Error("socket");
    };
    expect(await bearerUser(req("Bearer tok"))).toEqual({ kind: "outage" });
  });
  it("no Supabase configured: not_configured", async () => {
    config = null;
    expect(await bearerUser(req("Bearer tok"))).toEqual({ kind: "not_configured" });
  });
});
