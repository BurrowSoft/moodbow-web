// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_COOKIE, grantedAtConsent, parseConsentCookie, serializeConsent } from "@/lib/onboardingConsent";
import { onboardingStep } from "@/lib/journal/me";

// W0 part 2: the onboarding actions with mocked Supabase, cookies and
// next-intl redirects.
const auth = { getUser: vi.fn(), signUp: vi.fn(), signInWithPassword: vi.fn(), resend: vi.fn() };
const rpc = vi.fn();
let configured = true;
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => (configured ? { auth, rpc } : null) }));

const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => jar.set(name, { value, options }),
    delete: (name: string) => jar.delete(name),
  }),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
class Redirect {
  constructor(public args: { href: unknown; locale: string }) {}
}
vi.mock("@/i18n/navigation", () => ({
  redirect: (args: Redirect["args"]) => {
    throw new Redirect(args);
  },
}));

const { giveConsent } = await import("./consent/actions");
const { signUpFlow } = await import("./sign-up/actions");
const { completeSetup } = await import("./setup/actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const redirected = async (p: Promise<unknown>) => {
  try {
    return { state: await p };
  } catch (e) {
    if (e instanceof Redirect) return { redirect: e.args.href };
    throw e;
  }
};
const idle = { status: "idle" } as const;
const signedOut = () => auth.getUser.mockResolvedValue({ data: { user: null } });
const signedIn = () => auth.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
const me = (consents: Record<string, unknown>, has = false, onboarded: string | null = null) =>
  rpc.mockImplementation(async (name: string) =>
    name === "get_me" ? { data: { consents, has_required_consents: has, profile: { onboarded_at: onboarded }, today: "2026-10-02" }, error: null } : { data: {}, error: null },
  );

beforeEach(() => {
  configured = true;
  jar.clear();
  rpc.mockReset();
  for (const fn of Object.values(auth)) fn.mockReset();
});

describe("consent cookie", () => {
  it("round-trips the current grants and rejects anything else", () => {
    expect(parseConsentCookie(serializeConsent(grantedAtConsent()))).toEqual(grantedAtConsent());
    expect(parseConsentCookie(undefined)).toBeNull();
    expect(parseConsentCookie("not json")).toBeNull();
    const stale = grantedAtConsent().map((i) => (i.kind === "privacy" ? { ...i, version: "2020-01-01" } : i));
    expect(parseConsentCookie(serializeConsent(stale))).toBeNull();
    const refused = grantedAtConsent().map((i) => (i.kind === "health_data" ? { ...i, granted: false } : i));
    expect(parseConsentCookie(serializeConsent(refused))).toBeNull();
  });
});

describe("onboardingStep", () => {
  it("consent first, then setup, then the journal", () => {
    expect(onboardingStep({ has_required_consents: false, profile: { onboarded_at: "x" } as never })).toBe("consent");
    expect(onboardingStep({ has_required_consents: true, profile: { onboarded_at: null } as never })).toBe("setup");
    expect(onboardingStep({ has_required_consents: true, profile: { onboarded_at: "2026-10-02" } as never })).toBe("journal");
  });
});

describe("giveConsent", () => {
  it("both required boxes, checked again on the server", async () => {
    signedOut();
    expect(await giveConsent(idle, form({ privacy: "on" }))).toMatchObject({ status: "error", error: "required" });
    expect(await giveConsent(idle, form({ health: "on" }))).toMatchObject({ status: "error", error: "required" });
    expect(jar.size).toBe(0);
  });

  it("signed out: a short-lived httpOnly cookie with the grants, then /sign-up", async () => {
    signedOut();
    expect(await redirected(giveConsent(idle, form({ privacy: "on", health: "on" })))).toEqual({ redirect: "/sign-up" });
    const cookie = jar.get(CONSENT_COOKIE)!;
    expect(parseConsentCookie(cookie.value)).toEqual(grantedAtConsent());
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", maxAge: 3600 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("works without Supabase config for the signed-out path", async () => {
    configured = false;
    expect(await redirected(giveConsent(idle, form({ privacy: "on", health: "on" })))).toEqual({ redirect: "/sign-up" });
  });

  it("signed in: record_consents (adds 18+ only when missing), then /app", async () => {
    signedIn();
    me({ age_18: { version: "1", granted: true } });
    expect(await redirected(giveConsent(idle, form({ privacy: "on", health: "on" })))).toEqual({ redirect: "/app" });
    expect(rpc).toHaveBeenCalledWith("record_consents", { p_items: grantedAtConsent() });

    rpc.mockReset();
    me({});
    expect(await giveConsent(idle, form({ privacy: "on", health: "on" }))).toMatchObject({ status: "error", error: "age" });
    expect(await redirected(giveConsent(idle, form({ privacy: "on", health: "on", age: "on" })))).toEqual({ redirect: "/app" });
    const items = rpc.mock.calls.find((c) => c[0] === "record_consents")![1].p_items;
    expect(items.map((i: { kind: string }) => i.kind)).toEqual(["privacy", "terms", "health_data", "age_18"]);
  });
});

describe("signUpFlow", () => {
  const withConsent = () => jar.set(CONSENT_COOKIE, { value: serializeConsent(grantedAtConsent()) });
  const valid = { email: " New@Example.invalid ", password: "secret-123", age: "on", time_zone: "Asia/Bangkok", intent: "signup" };

  it("validates email, password length and 18+", async () => {
    withConsent();
    expect(await signUpFlow(idle, form({ ...valid, email: "x" }))).toMatchObject({ status: "error", error: "emailInvalid" });
    expect(await signUpFlow(idle, form({ ...valid, password: "1234567" }))).toMatchObject({ status: "error", error: "passwordShort" });
    const { age: _age, ...noAge } = valid;
    expect(await signUpFlow(idle, form(noAge))).toMatchObject({ status: "error", error: "ageRequired" });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("no consent cookie → back to Consent, no account", async () => {
    expect(await redirected(signUpFlow(idle, form(valid)))).toEqual({ redirect: "/consent" });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("signs up with the consents (+ 18+), locale and time zone in metadata, then Check email", async () => {
    withConsent();
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    expect(await signUpFlow(idle, form(valid))).toEqual({ status: "checkEmail", email: "new@example.invalid" });
    const arg = auth.signUp.mock.calls[0][0];
    expect(arg.email).toBe("new@example.invalid");
    expect(arg.options.data.locale).toBe("en");
    expect(arg.options.data.time_zone).toBe("Asia/Bangkok");
    expect(arg.options.data.consents.map((c: { kind: string }) => c.kind)).toEqual(["privacy", "terms", "health_data", "age_18"]);
    expect(arg.options.data).not.toHaveProperty("country");
    expect(jar.has(CONSENT_COOKIE)).toBe(false);
  });

  it("a bad time zone is sent as null (the DB falls back to UTC)", async () => {
    withConsent();
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    await signUpFlow(idle, form({ ...valid, time_zone: "<script>" }));
    expect(auth.signUp.mock.calls[0][0].options.data.time_zone).toBeNull();
  });

  it("an existing address: Supabase's empty-identities answer and error codes → emailTaken", async () => {
    withConsent();
    auth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    expect(await signUpFlow(idle, form(valid))).toMatchObject({ status: "error", error: "emailTaken" });
    auth.signUp.mockResolvedValue({ data: {}, error: { code: "user_already_exists" } });
    expect(await signUpFlow(idle, form(valid))).toMatchObject({ status: "error", error: "emailTaken" });
    auth.signUp.mockResolvedValue({ data: {}, error: { code: "weak_password" } });
    expect(await signUpFlow(idle, form(valid))).toMatchObject({ status: "error", error: "passwordShort" });
  });

  it("I've confirmed my email: signs in with the in-memory password → /setup, or says not confirmed yet", async () => {
    const check = { status: "checkEmail", email: "new@example.invalid" } as const;
    auth.signInWithPassword.mockResolvedValue({ error: { code: "email_not_confirmed" } });
    expect(await signUpFlow(check, form({ intent: "confirmed", password: "secret-123" }))).toEqual({ ...check, notice: "notConfirmed" });
    auth.signInWithPassword.mockResolvedValue({ error: null });
    expect(await redirected(signUpFlow(check, form({ intent: "confirmed", password: "secret-123" })))).toEqual({ redirect: "/setup" });
    expect(auth.signInWithPassword).toHaveBeenLastCalledWith({ email: "new@example.invalid", password: "secret-123" });
  });

  it("Send it again: resent, or the rate-limit copy", async () => {
    const check = { status: "checkEmail", email: "new@example.invalid" } as const;
    auth.resend.mockResolvedValue({ error: null });
    expect(await signUpFlow(check, form({ intent: "resend" }))).toEqual({ ...check, notice: "resent" });
    auth.resend.mockResolvedValue({ error: { code: "over_email_send_rate_limit", status: 429 } });
    expect(await signUpFlow(check, form({ intent: "resend" }))).toEqual({ ...check, notice: "rateLimited" });
  });
});

describe("completeSetup", () => {
  it("saves the reminder and finishes onboarding → /app", async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    expect(await redirected(completeSetup({ status: "idle" }, form({ reminder_time: "07:30" })))).toEqual({ redirect: "/app" });
    expect(rpc).toHaveBeenCalledWith("complete_onboarding", { p_reminder_on: true, p_reminder_time: "07:30" });
    await redirected(completeSetup({ status: "idle" }, form({ reminder_off: "on", reminder_time: "bogus" })));
    expect(rpc).toHaveBeenLastCalledWith("complete_onboarding", { p_reminder_on: false, p_reminder_time: "21:00" });
  });

  it("stale consents → Consent; other errors → the generic error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "consent_required" } });
    expect(await redirected(completeSetup({ status: "idle" }, form({})))).toEqual({ redirect: "/consent" });
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await completeSetup({ status: "idle" }, form({}))).toEqual({ status: "error" });
  });
});

describe("errors keep what was typed (React resets the form after an action)", () => {
  it("sign-up echoes the email and the 18+ choice, never the password", async () => {
    jar.set(CONSENT_COOKIE, { value: serializeConsent(grantedAtConsent()) });
    const state = await signUpFlow(idle, form({ intent: "signup", email: "a@b.co", password: "short", age: "on" }));
    expect(state).toEqual({ status: "error", error: "passwordShort", email: "a@b.co", age: true });
    expect(JSON.stringify(state)).not.toContain("short\"");
  });
});
