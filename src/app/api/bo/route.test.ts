// @vitest-environment node
import { FunctionsHttpError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BO_CLIENT_WAIT_MS, BO_ERRORS, BO_SERVER_WAIT_MS } from "@/lib/journal/bo";

let gate = "draft";
const invoke = vi.fn();
const rpc = vi.fn();
let session: { access_token: string } | null = { access_token: "the-session" };
vi.mock("@/lib/conditions", () => ({ pageGate: () => gate }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getSession: async () => ({ data: { session } }) }, functions: { invoke: (...a: unknown[]) => invoke(...a) }, rpc: (...a: unknown[]) => rpc(...a) }),
}));
const route = await import("./route");

const KEY = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown, headers: Record<string, string> = { origin: "https://www.moodbow.com" }) =>
  route.POST(new Request("https://www.moodbow.com/api/bo", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers }));
const httpError = (status: number, body: unknown) => new FunctionsHttpError(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  gate = "draft";
  session = { access_token: "the-session" };
  invoke.mockReset();
  rpc.mockReset();
  vi.stubEnv("REGION_SECRET", "test-secret-not-real");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/bo: who may call", () => {
  it("behind its flag: 404 on Production", async () => {
    gate = "hidden";
    expect((await post({ action: "status" })).status).toBe(404);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("same-origin only", async () => {
    expect((await post({ action: "status" }, {})).status).toBe(403);
    expect((await post({ action: "status" }, { origin: "https://elsewhere.example" })).status).toBe(403);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("no session: says so, and calls nothing", async () => {
    session = null;
    expect(await (await post({ action: "status" })).json()).toEqual({ status: "error", code: "not_authenticated" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("a bad body, a bad key or an unknown action: invalid_value, and calls nothing", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ action: "send", client_key: "nope", text: "hi" })).status).toBe(400);
    expect((await post({ action: "send", client_key: KEY })).status).toBe(400);
    expect((await post({ action: "drop_tables" })).status).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("POST /api/bo: what it sends", () => {
  it("a send: the key, the text, a token signed here, and the person's session; never history", async () => {
    invoke.mockResolvedValue({ data: { reply: "Hello.", show_help: false, open_card: false, show_notice: false, conversation_full: false }, error: null });
    await post({ action: "send", client_key: KEY, text: "Hi", history: ["no"] }, { origin: "https://www.moodbow.com", "x-vercel-ip-country": "MX" });
    const [name, options] = invoke.mock.calls[0] as [string, { body: Record<string, unknown>; headers: Record<string, string>; timeout: number }];
    expect(name).toBe("bo");
    expect(Object.keys(options.body).sort()).toEqual(["action", "client_key", "region_token", "text"]);
    expect(options.body).toMatchObject({ action: "send", client_key: KEY, text: "Hi" });
    expect(String(options.body.region_token)).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(options.headers.Authorization).toBe("Bearer the-session");
    expect(options.timeout).toBe(BO_SERVER_WAIT_MS);
  });

  it("no country: a null token, and the function decides it's unknown", async () => {
    invoke.mockResolvedValue({ data: { available: false }, error: null });
    await post({ action: "status" });
    expect((invoke.mock.calls[0][1] as { body: unknown }).body).toEqual({ action: "status", region_token: null });
  });

  it("the waits line up with the contract's 60 s: the server's ends first, the route's limit is above both", () => {
    expect(BO_CLIENT_WAIT_MS).toBe(60_000);
    expect(BO_SERVER_WAIT_MS).toBeLessThan(BO_CLIENT_WAIT_MS);
    expect(route.maxDuration * 1000).toBeGreaterThan(BO_CLIENT_WAIT_MS);
  });
});

describe("POST /api/bo: what it answers", () => {
  it("a reply, its flags passed on, nothing cached", async () => {
    invoke.mockResolvedValue({ data: { reply: "Hello.", show_help: true, open_card: true, show_notice: true, conversation_full: true }, error: null });
    const res = await post({ action: "send", client_key: KEY, text: "Hi" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok", reply: "Hello.", showHelp: true, openCard: true, showNotice: true, conversationFull: true });
  });

  it("no reply in a 200: no answer, never an empty bubble", async () => {
    invoke.mockResolvedValue({ data: { reply: "" }, error: null });
    expect(await (await post({ action: "send", client_key: KEY, text: "Hi" })).json()).toEqual({ status: "no_answer" });
  });

  it("the status", async () => {
    invoke.mockResolvedValue({ data: { available: true, pictures: false, limits: { max_chars: 2000 } }, error: null });
    expect(await (await post({ action: "status" })).json()).toEqual({ status: "ok", available: true, pictures: false, maxChars: 2000 });
  });

  it.each(BO_ERRORS)("the function's %s comes through as that code", async (code) => {
    invoke.mockResolvedValue({ data: null, error: httpError(400, { error: code }) });
    expect(await (await post({ action: "status" })).json()).toEqual({ status: "error", code });
  });

  it("a code the contract doesn't have, or a gateway's own page: no answer", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(500, { error: "something_new" }) });
    expect(await (await post({ action: "status" })).json()).toEqual({ status: "no_answer" });
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response("<html>", { status: 502 })) });
    expect(await (await post({ action: "status" })).json()).toEqual({ status: "no_answer" });
  });

  it("it couldn't be reached, or the wait ran out: no answer, and the same key can be resent", async () => {
    invoke.mockRejectedValue(new Error("timeout"));
    expect(await (await post({ action: "send", client_key: KEY, text: "Hi" })).json()).toEqual({ status: "no_answer" });
    invoke.mockResolvedValue({ data: null, error: new Error("relay") });
    expect(await (await post({ action: "send", client_key: KEY, text: "Hi" })).json()).toEqual({ status: "no_answer" });
  });

  it("the notice really shown: the RPC, not the function", async () => {
    rpc.mockResolvedValue({ error: null });
    expect(await (await post({ action: "notice_shown" })).json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("bo_notice_shown");
    expect(invoke).not.toHaveBeenCalled();
  });
});
