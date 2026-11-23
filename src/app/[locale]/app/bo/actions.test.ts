// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POLICY_VERSIONS } from "@/lib/legalVersions";

const rpc = vi.fn(async (_name: string, _args?: object) => ({ error: null as { message: string } | null }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
vi.mock("@/lib/conditions", () => ({ pageGate: () => "draft" }));
vi.mock("@/lib/journal/gateChanged", () => ({ gateChanged: () => {} }));
const setAiEnabled = vi.fn<(on: boolean, confirm?: object) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
vi.mock("../me/actions", () => ({ setAiEnabled: (on: boolean, confirm?: object) => setAiEnabled(on, confirm) }));
const { giveBoConsent, turnBoOff } = await import("./actions");

beforeEach(() => {
  rpc.mockClear();
  setAiEnabled.mockClear();
});

describe("giveBoConsent", () => {
  it("Bo's own yes is the confirm, at this build's AI version (the AI go-live: no confirm, no consent)", async () => {
    expect(await giveBoConsent()).toEqual({ ok: true });
    expect(setAiEnabled).toHaveBeenCalledWith(true, { version: POLICY_VERSIONS.ai });
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
