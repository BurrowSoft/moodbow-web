// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Search (1.1 L): the user's own entries (RLS) by ilike, newest first, at most
// 50, with the % and _ they typed escaped; only a snippet comes back.
type Row = { id: string; entry_date: string; body: string; is_moment: boolean };
let rows: Row[] = [];
let readError: unknown = null;
let live = true;
const ilike = vi.fn();
const orders: unknown[][] = [];
let limit = 0;
const client = {
  from: (table: string) =>
    table === "entries"
      ? {
          select: () => {
            const q = {
              ilike: (...a: unknown[]) => (ilike(...a), q),
              order: (...a: unknown[]) => (orders.push(a), q),
              limit: async (n: number) => ((limit = n), readError ? { data: null, error: readError } : { data: rows.slice(0, n), error: null }),
            };
            return q;
          },
        }
      : { select: () => ({ in: async () => ({ data: [{ local_date: "2026-10-20", mood: 4 }], error: null }) }) },
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/lib/conditions", () => ({ pageGate: () => (live ? "live" : "hidden") }));
const { searchEntries } = await import("./searchActions");

const row = (n: number, body = "A long walk by the river."): Row => ({ id: `id-${n}`, entry_date: n === 0 ? "2026-10-20" : "2026-09-01", body, is_moment: n === 0 });

beforeEach(() => {
  rows = [];
  readError = null;
  live = true;
  ilike.mockReset();
  orders.length = 0;
  limit = 0;
});

describe("searchEntries", () => {
  it("ilike on the body with % and _ escaped; newest first; asks for 51", async () => {
    await searchEntries("  50%_off ");
    expect(ilike).toHaveBeenCalledWith("body", "%50\\%\\_off%");
    expect(orders).toEqual([
      ["entry_date", { ascending: false }],
      ["created_at", { ascending: false }],
    ]);
    expect(limit).toBe(51);
  });

  it("hits: id, date, moment, the day's mood and a snippet (never the whole body)", async () => {
    rows = [row(0), row(1)];
    const r = await searchEntries("river");
    expect(r).toEqual({
      status: "ok",
      more: false,
      hits: [
        { id: "id-0", date: "2026-10-20", isMoment: true, mood: 4, snippet: { before: "A long walk by the ", match: "river", after: "." } },
        { id: "id-1", date: "2026-09-01", isMoment: false, mood: null, snippet: { before: "A long walk by the ", match: "river", after: "." } },
      ],
    });
    expect(JSON.stringify(r)).not.toContain("body");
  });

  it("51 rows: 50 shown and more", async () => {
    rows = Array.from({ length: 60 }, (_, i) => row(i + 1));
    const r = await searchEntries("walk");
    expect(r.status === "ok" && r.hits.length).toBe(50);
    expect(r.status === "ok" && r.more).toBe(true);
  });

  it("too short, not live, or a failed read: error, and nothing is asked", async () => {
    expect(await searchEntries("a")).toEqual({ status: "error" });
    expect(ilike).not.toHaveBeenCalled();
    live = false;
    expect(await searchEntries("walk")).toEqual({ status: "error" });
    expect(ilike).not.toHaveBeenCalled();
    live = true;
    readError = { message: "boom" };
    expect(await searchEntries("walk")).toEqual({ status: "error" });
  });
});
