// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The Supabase server client, mocked: these tests pin what the confirm route
// and the reset action do with each answer.
const auth = {
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
};
let configured = true;
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => (configured ? { auth } : null),
}));

const { GET } = await import("./confirm/route");
const { resetPassword } = await import("./reset-password/actions");

const HASH = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071829";
const session = { access_token: "x" };

async function confirm(query: string) {
  const req = new NextRequest(`https://www.moodbow.com/en/auth/confirm${query}`);
  const res = await GET(req, { params: Promise.resolve({ locale: "en" }) });
  return { status: res.status, location: res.headers.get("location"), res };
}

beforeEach(() => {
  configured = true;
  for (const fn of Object.values(auth)) fn.mockReset();
  auth.signOut.mockResolvedValue({ error: null });
});

describe("GET /auth/confirm", () => {
  it("signup: verifies, ends the web session, 303 to /email-confirmed with no token in the URL", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    const { status, location, res } = await confirm(`?token_hash=${HASH}&type=signup`);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: HASH });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(status).toBe(303);
    expect(location).toBe("https://www.moodbow.com/email-confirmed");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("recovery: keeps the session and goes to /auth/reset-password", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    const { location } = await confirm(`?token_hash=${HASH}&type=recovery`);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(location).toBe("https://www.moodbow.com/auth/reset-password");
  });

  it("email_change: updated when a session comes back, pending when it doesn't", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    expect((await confirm(`?token_hash=${HASH}&type=email_change`)).location).toBe("https://www.moodbow.com/email-confirmed?result=email_changed");
    auth.verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: null });
    expect((await confirm(`?token_hash=${HASH}&type=email_change`)).location).toBe(
      "https://www.moodbow.com/email-confirmed?result=email_change_pending",
    );
  });

  it("an expired or used token → the expired page, no sign-out needed", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: { code: "otp_expired" } });
    const { location } = await confirm(`?token_hash=${HASH}&type=signup`);
    expect(location).toBe("https://www.moodbow.com/email-confirmed?result=expired");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("bad params never reach Supabase; redirect_to is ignored", async () => {
    for (const q of ["", "?type=signup", `?token_hash=${HASH}&type=sms`, `?token_hash=${HASH}&type=signup&redirect_to=https://evil.example`]) {
      auth.verifyOtp.mockResolvedValue({ data: { session }, error: null });
      const { location } = await confirm(q);
      expect(location, q).not.toContain("evil");
    }
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
  });

  it("fails closed without Supabase config", async () => {
    configured = false;
    const { location } = await confirm(`?token_hash=${HASH}&type=signup`);
    expect(location).toBe("https://www.moodbow.com/email-confirmed?result=expired");
  });
});

describe("resetPassword (server action)", () => {
  const form = (password: string, confirmValue = password) => {
    const f = new FormData();
    f.set("password", password);
    f.set("confirm", confirmValue);
    return f;
  };
  const idle = { status: "idle" } as const;

  it("validates before calling Supabase", async () => {
    expect(await resetPassword(idle, form("short"))).toEqual({ status: "error", error: "short" });
    expect(await resetPassword(idle, form("12345678", "12345679"))).toEqual({ status: "error", error: "mismatch" });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("without the recovery session → expired", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    expect(await resetPassword(idle, form("new-password-1"))).toEqual({ status: "error", error: "expired" });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("success: sets the password, then ends the session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    auth.updateUser.mockResolvedValue({ error: null });
    expect(await resetPassword(idle, form("new-password-1"))).toEqual({ status: "done" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("maps Supabase error codes, never messages", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    for (const [code, expected] of [
      ["weak_password", "short"],
      ["same_password", "same"],
      ["session_expired", "expired"],
      ["something_new", "generic"],
    ] as const) {
      auth.updateUser.mockResolvedValue({ error: { code, message: "raw server text" } });
      expect(await resetPassword(idle, form("new-password-1")), code).toEqual({ status: "error", error: expected });
    }
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
