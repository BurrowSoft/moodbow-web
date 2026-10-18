// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { entryErrorAction, parseEntry } from "@/lib/journal/entry";

// saveEntry / deleteEntry with a mocked Supabase client, plus the editor's
// form rules (lib/journal/entry.ts).
const rpc = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const from = vi.fn(() => ({ select: () => ({ eq }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc, from }) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
class Redirect {
  constructor(public args: { href: string; locale: string }) {}
}
vi.mock("@/i18n/navigation", () => ({
  redirect: (args: Redirect["args"]) => {
    throw new Redirect(args);
  },
}));

const { saveEntry, deleteEntry } = await import("./actions");

const ID = "3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const ENTRY = { id: ID, entry_date: "2026-10-02", body: "A good day.", is_moment: true, updated_at: "2026-10-02T10:00:00Z" };
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const valid = { id: ID, entry_date: "2026-10-02", body: "A good day.", is_moment: "true", expected_updated_at: "" };
const idle = { status: "idle" } as const;

beforeEach(() => {
  rpc.mockReset();
  maybeSingle.mockReset();
  eq.mockClear();
});

describe("parseEntry", () => {
  it("accepts a valid entry; an empty lock is null", () => {
    expect(parseEntry(form(valid))).toEqual({ id: ID, date: "2026-10-02", body: "A good day.", isMoment: true, expected: null });
  });
  it("rejects a blank or too-long body, a bad id or date", () => {
    for (const bad of [{ body: "   " }, { body: "x".repeat(20001) }, { id: "nope" }, { entry_date: "2 Oct" }]) {
      expect(parseEntry(form({ ...valid, ...bad })), JSON.stringify(bad).slice(0, 40)).toBeNull();
    }
    expect(parseEntry(form({ ...valid, body: "x".repeat(20000) }))).not.toBeNull();
  });
});

describe("entryErrorAction", () => {
  it("maps the RPC's codes", () => {
    expect(entryErrorAction("consent_required")).toEqual({ kind: "redirect", to: "/consent" });
    expect(entryErrorAction("not_authenticated")).toEqual({ kind: "redirect", to: "/sign-in" });
    expect(entryErrorAction("date_in_future")).toEqual({ kind: "error", error: "dateInFuture" });
    expect(entryErrorAction("stale_write")).toEqual({ kind: "error", error: "stale" });
    expect(entryErrorAction("entry_too_long")).toEqual({ kind: "error", error: "tooLong" });
    expect(entryErrorAction("entry_empty")).toEqual({ kind: "error", error: "generic" });
    expect(entryErrorAction("not_found")).toEqual({ kind: "error", error: "generic" });
  });
});

describe("saveEntry", () => {
  it("sends the editor's id, date, body, moment and lock", async () => {
    rpc.mockResolvedValue({ data: ENTRY, error: null });
    expect(await saveEntry(idle, form({ ...valid, expected_updated_at: "2026-10-01T09:00:00Z" }))).toEqual({ status: "saved", entry: ENTRY });
    expect(rpc).toHaveBeenCalledWith("save_entry", {
      p_id: ID,
      p_date: "2026-10-02",
      p_body: "A good day.",
      p_is_moment: true,
      p_expected_updated_at: "2026-10-01T09:00:00Z",
    });
  });

  it("an invalid form never reaches the RPC", async () => {
    expect(await saveEntry(idle, form({ ...valid, body: "" }))).toEqual({ status: "error", error: "generic" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stale_write: returns the server's version now", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "stale_write" } });
    maybeSingle.mockResolvedValue({ data: ENTRY });
    expect(await saveEntry(idle, form(valid))).toEqual({ status: "error", error: "stale", latest: ENTRY });
    expect(eq).toHaveBeenCalledWith("id", ID);
  });

  it("stale_write on an entry deleted elsewhere: latest is null", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "stale_write" } });
    maybeSingle.mockResolvedValue({ data: null });
    expect(await saveEntry(idle, form(valid))).toEqual({ status: "error", error: "stale", latest: null });
  });

  it("maps the other codes, and consent_required → Consent", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "entry_too_long" } });
    expect(await saveEntry(idle, form(valid))).toEqual({ status: "error", error: "tooLong" });
    rpc.mockResolvedValue({ data: null, error: { message: "date_in_future" } });
    expect(await saveEntry(idle, form(valid))).toEqual({ status: "error", error: "dateInFuture" });
    rpc.mockResolvedValue({ data: null, error: { message: "consent_required" } });
    const thrown = await saveEntry(idle, form(valid)).catch((e) => e);
    expect((thrown as Redirect).args).toEqual({ href: "/consent", locale: "en" });
  });
});

describe("deleteEntry", () => {
  const go = async (fields: Record<string, string>) => (await deleteEntry({ status: "idle" }, form(fields)).catch((e) => e)) as Redirect | { status: string };

  it("deletes and goes back to Today", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(((await go({ id: ID })) as Redirect).args).toEqual({ href: "/app", locale: "en" });
    expect(rpc).toHaveBeenCalledWith("delete_entry", { p_id: ID });
  });

  it("already deleted elsewhere (not_found): the same", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not_found" } });
    expect(((await go({ id: ID })) as Redirect).args.href).toBe("/app");
  });

  it("another failure stays on the page with an error; a bad id never reaches the RPC", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await go({ id: ID })).toEqual({ status: "error" });
    rpc.mockReset();
    expect(await go({ id: "x" })).toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
