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

  it("validates the email and maps real failures to the generic error", async () => {
    expect(await requestPasswordReset(idle, form({ email: "nope" }))).toEqual({ status: "error", error: "emailInvalid" });
    auth.resetPasswordForEmail.mockResolvedValue({ error: { code: "over_email_send_rate_limit" } });
    expect(await requestPasswordReset(idle, form({ email: "a@b.co" }))).toEqual({ status: "error", error: "generic" });
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
