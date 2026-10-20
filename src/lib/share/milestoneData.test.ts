import { describe, expect, it, vi } from "vitest";
import { loadMilestone } from "./milestoneData";
import { MOOD_HEX } from "./moodbow";

// A stand-in for supabase.from("check_ins").select(…).order(…).limit(…).
function fake(result: { data: unknown; count: number | null; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const chain = {
    from: vi.fn((...a: unknown[]) => ((calls.from = a), chain)),
    select: vi.fn((...a: unknown[]) => ((calls.select = a), chain)),
    order: vi.fn((...a: unknown[]) => ((calls.order = a), chain)),
    limit: vi.fn((...a: unknown[]) => ((calls.limit = a), Promise.resolve(result))),
  };
  return { supabase: chain as unknown as Parameters<typeof loadMilestone>[0], calls };
}
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ local_date: `2026-01-${String(31 - i).padStart(2, "0")}`, mood: (i % 5) + 1 }));

describe("loadMilestone", () => {
  it("one read: the exact count and the latest 31, newest first", async () => {
    const { supabase, calls } = fake({ data: rows(31), count: 120, error: null });
    const got = await loadMilestone(supabase);
    expect(calls.from).toEqual(["check_ins"]);
    expect(calls.select).toEqual(["local_date, mood", { count: "exact" }]);
    expect(calls.order).toEqual(["local_date", { ascending: false }]);
    expect(calls.limit).toEqual([31]);
    expect(got?.n).toBe(100);
    expect(got?.colours).toHaveLength(31);
    // Earliest first (the arc's innermost band): Jan 1 has mood 1 (index 30 → 30 % 5 + 1).
    expect(got?.colours[0]).toBe(MOOD_HEX[0]);
  });

  it("below 30 days, a failed read or no count: no milestone", async () => {
    expect(await loadMilestone(fake({ data: rows(29), count: 29, error: null }).supabase)).toBeNull();
    expect(await loadMilestone(fake({ data: null, count: null, error: { message: "x" } }).supabase)).toBeNull();
    expect(await loadMilestone(fake({ data: rows(5), count: null, error: null }).supabase)).toBeNull();
  });

  it("exactly 30 and 365", async () => {
    expect((await loadMilestone(fake({ data: rows(30), count: 30, error: null }).supabase))?.n).toBe(30);
    expect((await loadMilestone(fake({ data: rows(31), count: 400, error: null }).supabase))?.n).toBe(365);
  });
});
