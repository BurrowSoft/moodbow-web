// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// W0: the sign-in, forgot-password and sign-out actions with a mocked
// Supabase client.
const auth = {
  signInWithPassword: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signOut: vi.fn(),
};
let configured = true;
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => (configured ? { auth } : null) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
class Redirect {
  constructor(public args: unknown) {}
}
vi.mock("@/i18n/navigation", () => ({
  redirect: (args: unknown) => {
    throw new Redirect(args);
  },
}));

const { signIn } = await import("./sign-in/actions");
const { requestPasswordReset } = await import("./forgot-password/actions");
const { signOut } = await import("./app/me/actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const idle = { status: "idle" } as const;

beforeEach(() => {
  configured = true;
  for (const fn of Object.values(auth)) fn.mockReset();
});

describe("signIn", () => {
  it("checks the email shape before calling Supabase", async () => {
    expect(await signIn(idle, form({ email: "not-an-email", password: "x" }))).toEqual({ status: "error", error: "emailInvalid" });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("success: trims/lowercases the email, then redirects to /app", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    const result = await signIn(idle, form({ email: "  Jane@Example.invalid ", password: "secret-123" })).catch((e) => e);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "jane@example.invalid", password: "secret-123" });
    expect(result).toBeInstanceOf(Redirect);
    expect((result as Redirect).args).toEqual({ href: "/app", locale: "en" });
  });

  it("maps error codes (never messages)", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials", message: "raw" } });
    expect(await signIn(idle, form({ email: "a@b.co", password: "x" }))).toEqual({ status: "error", error: "badCredentials" });
    auth.signInWithPassword.mockResolvedValue({ error: { code: "email_not_confirmed", message: "raw" } });
    expect(await signIn(idle, form({ email: "a@b.co", password: "x" }))).toEqual({ status: "notConfirmed", email: "a@b.co" });
    auth.signInWithPassword.mockResolvedValue({ error: { code: "over_request_rate_limit", message: "raw" } });
    expect(await signIn(idle, form({ email: "a@b.co", password: "x" }))).toEqual({ status: "error", error: "generic" });
  });

  it("'Send it again' resends the signup confirmation for the unconfirmed email only", async () => {
    auth.resend.mockResolvedValue({ error: null });
    expect(await signIn({ status: "notConfirmed", email: "a@b.co" }, form({ intent: "resend" }))).toEqual({ status: "resent", email: "a@b.co" });
    expect(auth.resend).toHaveBeenCalledWith({ type: "signup", email: "a@b.co" });
    // Rate-limited: the user's own account, so it can be named.
    auth.resend.mockResolvedValue({ error: { code: "over_email_send_rate_limit", status: 429 } });
    expect(await signIn({ status: "notConfirmed", email: "a@b.co" }, form({ intent: "resend" }))).toEqual({ status: "error", error: "rateLimited" });
    // Not after a different outcome.
    auth.resend.mockClear();
    expect(await signIn(idle, form({ intent: "resend" }))).toEqual(idle);
    expect(auth.resend).not.toHaveBeenCalled();
  });

  it("fails closed without Supabase config", async () => {
    configured = false;
    expect(await signIn(idle, form({ email: "a@b.co", password: "x" }))).toEqual({ status: "error", error: "generic" });
  });
});

describe("requestPasswordReset", () => {
  it("never reveals whether the account exists", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    expect(await requestPasswordReset(idle, form({ email: "Nobody@Example.invalid" }))).toEqual({ status: "sent", email: "nobody@example.invalid" });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("nobody@example.invalid");
  });

  it("validates the email shape only", async () => {
    expect(await requestPasswordReset(idle, form({ email: "nope" }))).toEqual({ status: "error", error: "emailInvalid" });
  });

  it("answers the same for every Supabase outcome (rate limits only hit real accounts)", async () => {
    for (const error of [null, { code: "over_email_send_rate_limit", status: 429 }, { code: "unexpected_failure", status: 500 }]) {
      auth.resetPasswordForEmail.mockResolvedValue({ error });
      expect(await requestPasswordReset(idle, form({ email: "a@b.co" })), JSON.stringify(error)).toEqual({ status: "sent", email: "a@b.co" });
    }
    configured = false;
    expect(await requestPasswordReset(idle, form({ email: "a@b.co" }))).toEqual({ status: "sent", email: "a@b.co" });
  });
});

describe("signOut (Me)", () => {
  it("signs out this browser only, then goes to sign-in", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    const result = await signOut().catch((e) => e);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect((result as Redirect).args).toEqual({ href: "/sign-in", locale: "en" });
  });
});

describe("session cookies", () => {
  it("are httpOnly + lax (secure on Vercel): no browser code reads them", async () => {
    const { SESSION_COOKIE_OPTIONS } = await vi.importActual<typeof import("@/lib/supabase/server")>("@/lib/supabase/server");
    expect(SESSION_COOKIE_OPTIONS).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });
});
