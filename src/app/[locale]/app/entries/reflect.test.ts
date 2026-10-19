// @vitest-environment node
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reflectOutcome } from "@/lib/journal/reflect";

// The reflect server action (M9) against reflect.md, with a mocked client.
const invoke = vi.fn();
const getSession = vi.fn();
const eq = vi.fn();
const del = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ delete: del }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getSession }, functions: { invoke }, from }) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
class Redirect {
  constructor(public args: { href: string; locale: string }) {}
}
vi.mock("@/i18n/navigation", () => ({
  redirect: (args: Redirect["args"]) => {
    throw new Redirect(args);
  },
}));
const { reflectOnEntry, deleteReflection } = await import("./reflectActions");

const ENTRY = "3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const KEY = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
const REFLECTION = { id: "0b5f2c1e-7d3a-4e8b-9c41-2a6f8e1d3b70", entry_id: ENTRY, body: "It sounds like a long day.\n\nWhat helped most?", tier: "full", created_at: "2026-10-19T09:00:00Z" };
const httpError = (status: number, code: string) => new FunctionsHttpError(new Response(JSON.stringify({ error: code }), { status }));

beforeEach(() => {
  invoke.mockReset();
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: "jwt-123" } } });
  eq.mockReset();
});

describe("reflectOnEntry", () => {
  it("sends only the ids, with the user's token; returns the reflection and the balance", async () => {
    invoke.mockResolvedValue({ data: { reflection: REFLECTION, credits: { balance: 691, tier_now: "full" } }, error: null });
    expect(await reflectOnEntry(ENTRY, KEY)).toEqual({
      status: "ok",
      reflection: { id: REFLECTION.id, body: REFLECTION.body, tier: "full", created_at: REFLECTION.created_at },
      balance: 691,
    });
    expect(invoke).toHaveBeenCalledWith("reflect", { body: { entry_id: ENTRY, client_key: KEY }, headers: { Authorization: "Bearer jwt-123" }, timeout: 45_000 });
  });

  it("maps every contract error to what the page shows", async () => {
    for (const [status, code, expected] of [
      [409, "in_progress", { status: "in_progress" }],
      [403, "ai_disabled", { status: "hidden" }],
      [403, "ai_consent_required", { status: "error", message: "meAiOffHint" }],
      [429, "rate_limited", { status: "error", message: "errRateLimited" }],
      [429, "daily_limit", { status: "error", message: "dailyLimit" }],
      [404, "not_found", { status: "error", message: "reflectError" }],
      [400, "invalid_value", { status: "error", message: "reflectError" }],
      [503, "ai_budget_exhausted", { status: "error", message: "reflectError" }],
      [502, "reflect_failed", { status: "error", message: "reflectError" }],
      [500, "something_new", { status: "error", message: "reflectError" }],
    ] as const) {
      invoke.mockResolvedValueOnce({ data: null, error: httpError(status, code) });
      expect(await reflectOnEntry(ENTRY, KEY), code).toEqual(expected);
    }
  });

  it("401 or no session: sign in again", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(401, "not_authenticated") });
    await expect(reflectOnEntry(ENTRY, KEY)).rejects.toBeInstanceOf(Redirect);
    getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(reflectOnEntry(ENTRY, KEY)).rejects.toBeInstanceOf(Redirect);
  });

  it("no answer from the function (unreachable, relay, a gateway page without a code): no_answer, so the same key is resent (reviewer #34)", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new FunctionsFetchError(new TypeError("fetch failed")) });
    expect(await reflectOnEntry(ENTRY, KEY)).toEqual({ status: "no_answer" });
    invoke.mockResolvedValueOnce({ data: null, error: new FunctionsRelayError(new Response("relay", { status: 502 })) });
    expect(await reflectOnEntry(ENTRY, KEY)).toEqual({ status: "no_answer" });
    invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError(new Response("<html>504 Gateway Time-out</html>", { status: 504, headers: { "content-type": "text/html" } })) });
    expect(await reflectOnEntry(ENTRY, KEY)).toEqual({ status: "no_answer" });
    invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ message: "x" }), { status: 546 })) });
    expect(await reflectOnEntry(ENTRY, KEY)).toEqual({ status: "no_answer" });
  });

  it("a held call ends at the 45 s deadline, or invoke throws: no_answer (Web Tester, #35)", async () => {
    invoke.mockRejectedValueOnce(new DOMException("The operation was aborted.", "AbortError"));
    expect(await reflectOnEntry(ENTRY, KEY)).toEqual({ status: "no_answer" });
  });

  it("a 200 without a reflection: the friendly error", async () => {
    invoke.mockResolvedValueOnce({ data: { credits: {} }, error: null });
    expect(await reflectOnEntry(ENTRY, KEY)).toEqual({ status: "error", message: "reflectError" });
  });

  it("not uuids: nothing is sent", async () => {
    expect(await reflectOnEntry("nope", KEY)).toEqual({ status: "error", message: "reflectError" });
    expect(await reflectOnEntry(ENTRY, "x")).toEqual({ status: "error", message: "reflectError" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("a Lite reply keeps its tier", async () => {
    invoke.mockResolvedValue({ data: { reflection: { ...REFLECTION, tier: "lite" }, credits: { balance: 0 } }, error: null });
    expect(await reflectOnEntry(ENTRY, KEY)).toMatchObject({ reflection: { tier: "lite" }, balance: 0 });
  });
});

describe("deleteReflection", () => {
  it("an RLS delete by id; a failure says so; bad ids never reach the database", async () => {
    eq.mockResolvedValueOnce({ error: null });
    expect(await deleteReflection(REFLECTION.id)).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("ai_reflections");
    expect(eq).toHaveBeenCalledWith("id", REFLECTION.id);
    eq.mockResolvedValueOnce({ error: { message: "boom" } });
    expect(await deleteReflection(REFLECTION.id)).toEqual({ ok: false });
    eq.mockClear();
    expect(await deleteReflection("nope")).toEqual({ ok: false });
    expect(eq).not.toHaveBeenCalled();
  });
});

describe("reflectOutcome", () => {
  it("unknown codes are the friendly error", () => {
    expect(reflectOutcome(undefined)).toEqual({ status: "error", message: "reflectError" });
  });
});
