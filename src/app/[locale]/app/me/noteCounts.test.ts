// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { noteKey } from "@/lib/import/noteDedupe";

// existingNoteCounts (1.1 P M1): the account's notes on the file's days, as
// counts per hashed (day, text). Dates only in the request, paged, no text
// in the answer.
type Row = { entry_date: string; body: string };
let rows: Row[] = [];
let failAt: number | null = null;
const reads: { dates: string[]; from: number; to: number }[] = [];
const client = {
  auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  from: () => ({
    select: () => ({
      in: (_col: string, dates: string[]) => ({
        order: () => ({
          range: async (from: number, to: number) => {
            reads.push({ dates, from, to });
            if (failAt === reads.length) return { data: null, error: { message: "boom" } };
            const hits = rows.filter((r) => dates.includes(r.entry_date));
            return { data: hits.slice(from, to + 1), error: null };
          },
        }),
      }),
    }),
  }),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/lib/journal/me", () => ({ getMe: async () => ({ today: "2026-10-20" }) }));
vi.mock("@/i18n/navigation", () => ({ redirect: () => { throw new Error("NEXT_REDIRECT"); } }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
const { existingNoteCounts } = await import("./importActions");

beforeEach(() => {
  rows = [];
  failAt = null;
  reads.length = 0;
});

describe("existingNoteCounts", () => {
  it("counts per hashed (day, text); no note text comes back", async () => {
    rows = [
      { entry_date: "2026-10-01", body: "Same" },
      { entry_date: "2026-10-01", body: "Same" },
      { entry_date: "2026-10-02", body: "Other" },
    ];
    const r = await existingNoteCounts(["2026-10-01", "2026-10-02"]);
    expect(r.status).toBe("ok");
    const counts = new Map(r.status === "ok" ? r.counts : []);
    expect(counts.get(await noteKey("2026-10-01", "Same"))).toBe(2);
    expect(counts.get(await noteKey("2026-10-02", "Other"))).toBe(1);
    expect(JSON.stringify(r)).not.toMatch(/Same|Other/);
  });

  it("pages past 1,000 rows, and reads dates 100 at a time", async () => {
    rows = Array.from({ length: 2500 }, () => ({ entry_date: "2026-10-01", body: "x" }));
    // 150 other days before it (Jan–May 2026).
    const dates = Array.from({ length: 150 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
    const r = await existingNoteCounts(["2026-10-01", ...dates]);
    const counts = new Map(r.status === "ok" ? r.counts : []);
    expect(counts.get(await noteKey("2026-10-01", "x"))).toBe(2500);
    expect(reads.filter((q) => q.dates.includes("2026-10-01")).map((q) => q.from)).toEqual([0, 1000, 2000]);
    expect(Math.max(...reads.map((q) => q.dates.length))).toBeLessThanOrEqual(100);
  });

  it("bad dates, too many, or a failed read: error", async () => {
    expect(await existingNoteCounts(["yesterday"])).toEqual({ status: "error" });
    expect(await existingNoteCounts(Array.from({ length: 2001 }, () => "2026-10-01"))).toEqual({ status: "error" });
    failAt = 1;
    expect(await existingNoteCounts(["2026-10-01"])).toEqual({ status: "error" });
  });

  it("no days: nothing to read", async () => {
    expect(await existingNoteCounts([])).toEqual({ status: "ok", counts: [] });
    expect(reads).toHaveLength(0);
  });
});
