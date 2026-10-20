// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The import batches (1.1 K): what's already there is read first and left
// alone (never overwriting); every row is checked again on the server.
const rpc = vi.fn();
let existingDays: string[] = [];
let existingIds: string[] = [];
let readError: unknown = null;
const client = {
  auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  rpc: (...a: unknown[]) => rpc(...a),
  from: (table: string) => ({
    select: () => ({
      in: async () =>
        readError
          ? { data: null, error: readError }
          : { data: table === "check_ins" ? existingDays.map((local_date) => ({ local_date })) : existingIds.map((id) => ({ id })), error: null },
    }),
  }),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/lib/journal/me", () => ({ getMe: async () => ({ today: "2026-10-20" }) }));
vi.mock("@/i18n/navigation", () => ({ redirect: () => { throw new Error("NEXT_REDIRECT"); } }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
const { importCheckIns, importEntries } = await import("./importActions");

const ID = (n: number) => `0b5f2c1e-7d3a-5e8b-9c41-2a6f8e1d3b${String(n).padStart(2, "0")}`;

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: {}, error: null });
  existingDays = [];
  existingIds = [];
  readError = null;
});

describe("importCheckIns", () => {
  it("writes only the days without a check-in; ours are kept (skipped)", async () => {
    existingDays = ["2026-10-02"];
    const r = await importCheckIns([
      { date: "2026-10-01", mood: 4 },
      { date: "2026-10-02", mood: 1 },
    ]);
    expect(r).toEqual({ status: "ok", written: ["2026-10-01"], skipped: 1 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("upsert_check_in", expect.objectContaining({ p_date: "2026-10-01", p_mood: 4, p_expected_updated_at: null }));
  });

  it("rejects the whole batch for any bad row: a future day, a mood out of range, too many rows", async () => {
    expect(await importCheckIns([{ date: "2026-10-21", mood: 3 }])).toEqual({ status: "error" });
    expect(await importCheckIns([{ date: "2026-10-01", mood: 6 }])).toEqual({ status: "error" });
    expect(await importCheckIns(Array.from({ length: 101 }, () => ({ date: "2026-10-01", mood: 3 })))).toEqual({ status: "error" });
    expect(await importCheckIns([])).toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a failed read writes nothing", async () => {
    readError = { message: "x" };
    expect(await importCheckIns([{ date: "2026-10-01", mood: 3 }])).toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("importEntries", () => {
  it("saves only the ids not already there, in the order given, as new entries (a re-import writes 0)", async () => {
    existingIds = [ID(2)];
    const r = await importEntries([
      { id: ID(1), date: "2026-10-01", body: "First" },
      { id: ID(2), date: "2026-10-01", body: "Second" },
      { id: ID(3), date: "2026-10-02", body: "Third" },
    ]);
    expect(r).toEqual({ status: "ok", written: [ID(1), ID(3)], skipped: 1 });
    expect(rpc.mock.calls.map((c) => (c[1] as { p_id: string }).p_id)).toEqual([ID(1), ID(3)]);
    expect(rpc).toHaveBeenCalledWith("save_entry", expect.objectContaining({ p_body: "First", p_is_moment: false, p_expected_updated_at: null }));

    rpc.mockClear();
    existingIds = [ID(1), ID(2), ID(3)];
    expect(await importEntries([{ id: ID(1), date: "2026-10-01", body: "First" }])).toEqual({ status: "ok", written: [], skipped: 1 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a bad id, an empty or too-long body, or a future day", async () => {
    expect(await importEntries([{ id: "nope", date: "2026-10-01", body: "x" }])).toEqual({ status: "error" });
    expect(await importEntries([{ id: ID(1), date: "2026-10-01", body: "  " }])).toEqual({ status: "error" });
    expect(await importEntries([{ id: ID(1), date: "2026-10-01", body: "x".repeat(20001) }])).toEqual({ status: "error" });
    expect(await importEntries([{ id: ID(1), date: "2026-10-21", body: "x" }])).toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a write that fails stops the batch with an error", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await importEntries([{ id: ID(1), date: "2026-10-01", body: "x" }])).toEqual({ status: "error" });
  });
});

describe("our own CSV export's values (1.1 P)", () => {
  it("a check-in's other values go to upsert_check_in, checked by the check-in's rules", async () => {
    await importCheckIns([{ date: "2026-10-01", mood: 4, sleep_hours: 7.5, sleep_quality: "good", exercise_minutes: 30, stress: 2 }]);
    expect(rpc).toHaveBeenCalledWith("upsert_check_in", expect.objectContaining({ p_sleep_hours: 7.5, p_sleep_quality: "good", p_exercise_minutes: 30, p_stress: 2 }));
    for (const bad of [{ sleep_hours: 7.3 }, { sleep_quality: "meh" }, { exercise_minutes: 20 }, { stress: 6 }]) {
      expect(await importCheckIns([{ date: "2026-10-01", mood: 4, ...bad }])).toEqual({ status: "error" });
    }
  });

  it("an entry's moment goes to save_entry; none means false", async () => {
    await importEntries([{ id: ID(1), date: "2026-10-01", body: "A", isMoment: true }]);
    expect(rpc).toHaveBeenLastCalledWith("save_entry", expect.objectContaining({ p_is_moment: true }));
    await importEntries([{ id: ID(2), date: "2026-10-01", body: "B" }]);
    expect(rpc).toHaveBeenLastCalledWith("save_entry", expect.objectContaining({ p_is_moment: false }));
  });
});
