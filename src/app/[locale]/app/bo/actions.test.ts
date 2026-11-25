// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POLICY_VERSIONS } from "@/lib/legalVersions";

const rpc = vi.fn(async (_name: string, _args?: object) => ({ error: null as { message: string } | null }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
vi.mock("@/lib/conditions", () => ({ pageGate: () => "draft" }));
vi.mock("@/lib/journal/gateChanged", () => ({ gateChanged: () => {} }));
// The AI consent's one writer (lib/journal/aiConsentWrite): what it answers is set per test.
const write = vi.fn<() => Promise<{ step: "consent" | "setting"; message: string } | null>>(async () => null);
vi.mock("@/lib/journal/aiConsentWrite", () => ({ recordAiConsentAndTurnOn: () => write() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
class Redirect {
  constructor(public args: { href: string; locale: string }) {}
}
vi.mock("@/i18n/navigation", () => ({
  redirect: (args: Redirect["args"]) => {
    throw new Redirect(args);
  },
}));
const { giveBoConsent, turnBoOff } = await import("./actions");

beforeEach(() => {
  rpc.mockClear();
  write.mockClear();
});

describe("giveBoConsent", () => {
  // Behind Bo's own gate (bo-live), not the journal's AI switch: the #423 journey "Bo's screen at large text" runs
  // with staging's AI switch off, and its yes still goes through.
  it("Bo's yes goes through the AI consent's one writer, once", async () => {
    expect(await giveBoConsent()).toEqual({ ok: true });
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("a failed write says so; a lost session goes to sign-in", async () => {
    write.mockResolvedValueOnce({ step: "setting", message: "boom" });
    expect(await giveBoConsent()).toEqual({ ok: false });
    write.mockResolvedValueOnce({ step: "consent", message: "not_authenticated" });
    await expect(giveBoConsent()).rejects.toBeInstanceOf(Redirect);
  });
});

describe("turnBoOff", () => {
  it("one call, with the current AI version, and no consent recorded on the side", async () => {
    expect(await turnBoOff()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("bo_turn_off", { p_ai_version: POLICY_VERSIONS.ai });
  });
  it("a failure says so", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "unknown_version" } });
    expect(await turnBoOff()).toEqual({ ok: false });
  });
});
