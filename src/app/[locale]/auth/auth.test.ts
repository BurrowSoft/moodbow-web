// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Supabase server client, mocked: these tests pin what the confirm page,
// its action and the reset action do with each answer.
const auth = {
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
};
let configured = true;
const createClient = vi.fn(async () => (configured ? { auth } : null));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => createClient() }));

// next-intl: text keys come back as "namespace.key"; redirect throws like the
// real one, carrying its arguments.
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  setRequestLocale: () => {},
  getTranslations: async (ns: string | { namespace: string }) => (key: string) => `${typeof ns === "string" ? ns : ns.namespace}.${key}`,
}));
class Redirect {
  constructor(public args: { href: string | { pathname: string; query: Record<string, string> }; locale: string }) {}
}
vi.mock("@/i18n/navigation", () => ({
  redirect: (args: Redirect["args"]) => {
    throw new Redirect(args);
  },
}));

const { default: ConfirmLinkPage } = await import("./confirm/page");
const { confirmLink } = await import("./confirm/actions");
const { resetPassword } = await import("./reset-password/actions");

const HASH = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071829";
const session = { access_token: "x" };

beforeEach(() => {
  configured = true;
  createClient.mockClear();
  for (const fn of Object.values(auth)) fn.mockReset();
  auth.signOut.mockResolvedValue({ error: null });
});

// Depth-first search through a React element tree for props matching `test`.
function findProps(node: unknown, test: (p: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findProps(n, test);
      if (hit) return hit;
    }
    return undefined;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) return undefined;
  if (test(props)) return props;
  return findProps(props.children, test);
}

describe("GET /auth/confirm (the page)", () => {
  const render = (query: Record<string, string>) =>
    ConfirmLinkPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve(query) } as never);

  it("never calls Supabase, so a link scanner can't spend the token", async () => {
    for (const type of ["signup", "recovery", "email_change"]) {
      await render({ token_hash: HASH, type });
    }
    await render({});
    expect(createClient).not.toHaveBeenCalled();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("renders one button per type, carrying the token in the form", async () => {
    const page = await render({ token_hash: HASH, type: "recovery" });
    expect(findProps(page, (p) => p.title === "confirmLink.recoveryTitle")).toBeTruthy();
    expect(findProps(page, (p) => p.name === "token_hash")?.value).toBe(HASH);
    expect(findProps(page, (p) => p.name === "type")?.value).toBe("recovery");
    expect(findProps(page, (p) => p.children === "confirmLink.recoveryButton")).toBeTruthy();
    const signup = await render({ token_hash: HASH, type: "signup" });
    expect(findProps(signup, (p) => p.children === "confirmLink.signupButton")).toBeTruthy();
    const change = await render({ token_hash: HASH, type: "email_change" });
    expect(findProps(change, (p) => p.children === "confirmLink.emailChangeButton")).toBeTruthy();
  });

  it("missing or bad params → the expired copy, no form", async () => {
    for (const query of [{}, { token_hash: HASH, type: "sms" }, { token_hash: "x", type: "signup" }] as Record<string, string>[]) {
      const page = await render(query);
      expect(findProps(page, (p) => p.title === "emailConfirmed.errorTitle"), JSON.stringify(query)).toBeTruthy();
      expect(findProps(page, (p) => p.name === "token_hash")).toBeUndefined();
    }
  });
});

describe("confirmLink (the button's POST)", () => {
  const query = (args: Redirect["args"]) => (typeof args.href === "string" ? {} : args.href.query);
  const post = async (fields: Record<string, string>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    try {
      await confirmLink(form);
    } catch (e) {
      if (e instanceof Redirect) return e.args;
      throw e;
    }
    throw new Error("expected a redirect");
  };

  it("signup: verifies, ends the web session, redirects to /email-confirmed", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    // A plain path when there's no result (no trailing "?").
    expect(await post({ token_hash: HASH, type: "signup" })).toEqual({ href: "/email-confirmed", locale: "en" });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: HASH });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("recovery: keeps the session and goes to /auth/reset-password", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    expect((await post({ token_hash: HASH, type: "recovery" })).href).toBe("/auth/reset-password");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("email_change: updated with a session, pending without one", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    expect(query(await post({ token_hash: HASH, type: "email_change" }))).toEqual({ result: "email_changed" });
    auth.verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: null });
    expect(query(await post({ token_hash: HASH, type: "email_change" }))).toEqual({ result: "email_change_pending" });
  });

  it("an expired or used token → expired", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: { code: "otp_expired" } });
    expect((await post({ token_hash: HASH, type: "signup" })).href).toEqual({ pathname: "/email-confirmed", query: { result: "expired" } });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("bad fields never reach Supabase; missing config fails closed", async () => {
    expect(query(await post({ token_hash: HASH, type: "sms" }))).toEqual({ result: "expired" });
    expect(query(await post({}))).toEqual({ result: "expired" });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    configured = false;
    expect(query(await post({ token_hash: HASH, type: "signup" }))).toEqual({ result: "expired" });
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

  it("success: sets the password, signs out every session (global), then redirects to the changed state", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    auth.updateUser.mockResolvedValue({ error: null });
    const redirected = await resetPassword(idle, form("new-password-1")).catch((e) => e);
    expect(redirected).toBeInstanceOf(Redirect);
    expect((redirected as Redirect).args).toEqual({ href: { pathname: "/auth/reset-password", query: { status: "changed" } }, locale: "en" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
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
