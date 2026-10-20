// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The calendar's month (1.1 M): check-ins and entries by date range only
// (no text in the request or the answer), own rows by RLS.
const calls: { table: string; select: string; gte: unknown[]; lte: unknown[] }[] = [];
let failTable: string | null = null;
let live = true;
const client = {
  from: (table: string) => ({
    select: (select: string) => {
      const call = { table, select, gte: [] as unknown[], lte: [] as unknown[] };
      calls.push(call);
      return {
        gte: (...g: unknown[]) => ((call.gte = g), {
          lte: async (...l: unknown[]) => {
            call.lte = l;
            if (failTable === table) return { data: null, error: { message: "boom" } };
            return table === "check_ins"
              ? { data: [{ local_date: "2026-10-01", mood: 4 }], error: null }
              : { data: [{ entry_date: "2026-10-02", is_moment: true }], error: null };
          },
        }),
      };
    },
  }),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/lib/conditions", () => ({ pageGate: () => (live ? "live" : "hidden") }));
const { loadCalendarMonth } = await import("./calendarActions");

beforeEach(() => {
  calls.length = 0;
  failTable = null;
  live = true;
});

describe("loadCalendarMonth", () => {
  it("the month's check-ins and entries by date, never a body", async () => {
    expect(await loadCalendarMonth("2026-10")).toEqual({
      status: "ok",
      days: { "2026-10-01": { mood: 4, moment: false, entry: false }, "2026-10-02": { mood: null, moment: true, entry: true } },
    });
    expect(calls).toEqual([
      { table: "check_ins", select: "local_date, mood", gte: ["local_date", "2026-10-01"], lte: ["local_date", "2026-10-31"] },
      { table: "entries", select: "entry_date, is_moment", gte: ["entry_date", "2026-10-01"], lte: ["entry_date", "2026-10-31"] },
    ]);
  });

  it("not a month, not live, or a failed read: error", async () => {
    expect(await loadCalendarMonth("2026-13")).toEqual({ status: "error" });
    expect(calls).toHaveLength(0);
    live = false;
    expect(await loadCalendarMonth("2026-10")).toEqual({ status: "error" });
    live = true;
    failTable = "entries";
    expect(await loadCalendarMonth("2026-10")).toEqual({ status: "error" });
  });
});
