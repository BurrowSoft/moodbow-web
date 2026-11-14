// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// The server's check on letters (1.3 §3): only saving a new letter asks about Plus; Open, Not now,
// delete and the list never do. A Plus read that fails is an error, never a pass.
type Result = { data?: unknown; error: unknown; count?: number | null };
let entitlement: Result = { data: null, error: null };
let sinceCount: Result = { count: 0, error: null };
const rpc = vi.fn((): Promise<{ data: unknown; error: unknown }> => Promise.resolve({ data: { body: "Dear me." }, error: null }));
const tables: string[] = [];
const sinceAt: [string, string][] = [];
const query = (table: string) => {
  tables.push(table);
  if (table === "entitlements") return { select: () => ({ maybeSingle: () => Promise.resolve(entitlement) }) };
  return {
    select: (_cols: string, opts?: { head?: boolean }) =>
      opts?.head ? { gt: (col: string, at: string) => (sinceAt.push([col, at]), Promise.resolve(sinceCount)) } : Promise.resolve({ data: [], error: null }),
  };
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => Promise.resolve({ from: query, rpc }) }));
vi.mock("@/lib/plus/letters", async (orig) => ({ ...(await orig<typeof import("@/lib/plus/letters")>()), lettersGate: () => "live" }));
const { deleteLetter, letterNotNow, openLetter, saveLetter } = await import("./actions");

const day = 86_400_000;
const row = (status: string, endIn: number) => ({ user_id: "u", source: "stripe", status, trial_ends_at: null, current_period_end: new Date(Date.now() + endIn).toISOString(), trial_started_at: null, store_customer_id: null, store_subscription_id: null, store_product_id: null });
afterEach(() => {
  entitlement = { data: null, error: null };
  sinceCount = { count: 0, error: null };
  tables.length = 0;
  vi.clearAllMocks();
});

describe("saveLetter: Plus, checked on the server", () => {
  it("with Plus: saved", async () => {
    entitlement = { data: row("active", day), error: null };
    expect((await saveLetter("Dear me.", 1)).status).toBe("ok");
    expect(rpc).toHaveBeenCalledWith("letter_save", { p_body: "Dear me.", p_months: 1 });
  });
  it("without Plus, or no row: plus_required, and nothing is written", async () => {
    expect((await saveLetter("Dear me.", 1)).status).toBe("plus_required");
    entitlement = { data: row("canceled", -30 * day), error: null };
    expect((await saveLetter("Dear me.", 1)).status).toBe("plus_required");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("the Plus read fails: an error, never a pass", async () => {
    entitlement = { data: null, error: { message: "down" } };
    expect((await saveLetter("Dear me.", 1)).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("Plus ended within the day: the draft in progress is saved once; then plus_required", async () => {
    entitlement = { data: row("canceled", -60_000), error: null };
    expect((await saveLetter("Dear me.", 1)).status).toBe("ok");
    sinceCount = { count: 1, error: null };
    expect((await saveLetter("Dear me, again.", 1)).status).toBe("plus_required");
    expect(rpc).toHaveBeenCalledTimes(1);
    // "Since" is letters created after Plus ended, as the database counts it (032).
    expect(sinceAt.at(-1)).toEqual(["created_at", (entitlement.data as { current_period_end: string }).current_period_end]);
  });
  it("the database refuses (032's plus_required): the same answer", async () => {
    entitlement = { data: row("active", day), error: null };
    rpc.mockReturnValueOnce(Promise.resolve({ data: null, error: { message: "plus_required" } }));
    expect((await saveLetter("Dear me.", 1)).status).toBe("plus_required");
  });
});

describe("Open, Not now and delete never ask about Plus", () => {
  it("no Plus row read at all", async () => {
    expect((await openLetter("a")).status).toBe("ok");
    expect((await letterNotNow("a")).status).toBe("ok");
    rpc.mockReturnValueOnce(Promise.resolve({ data: null, error: null }));
    expect((await deleteLetter("a")).status).toBe("ok");
    expect(tables).not.toContain("entitlements");
  });
});
