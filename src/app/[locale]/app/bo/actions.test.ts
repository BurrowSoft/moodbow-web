// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POLICY_VERSIONS } from "@/lib/legalVersions";

const rpc = vi.fn(async (_name: string, _args?: object) => ({ error: null as { message: string } | null }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
vi.mock("@/lib/conditions", () => ({ pageGate: () => "draft" }));
vi.mock("@/lib/journal/gateChanged", () => ({ gateChanged: () => {} }));
vi.mock("../me/actions", () => ({ setAiEnabled: async () => ({ ok: true }) }));
const { turnBoOff } = await import("./actions");

beforeEach(() => rpc.mockClear());

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
