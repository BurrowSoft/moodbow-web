// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// saveCheckIn with the day's routine ticks (1.4 F; the app's migration 038): checked before
// anything is sent, set after the check-in (and the tags) in one call; the check-in stays saved
// when they fail; ignored where routine-live is off.
const rpc = vi.fn();
const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc, from }) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/i18n/navigation", () => ({ redirect: () => undefined }));
const gate = { routine: "shown" as "shown" | "hidden" };
vi.mock("@/lib/conditions", async (orig) => {
  const real = await orig<typeof import("@/lib/conditions")>();
  return { ...real, pageGate: (key: string) => (key === "routine-live" ? gate.routine : real.pageGate(key as never)) };
});
const { saveCheckIn } = await import("./actions");

const A = "0b6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const B = "1c7f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const ME = { profile: { time_zone: "Asia/Bangkok", onboarded_at: "x" }, consents: {}, today: "2026-10-02" };
const ROW = { local_date: "2026-10-02", mood: 4, sleep_hours: null, sleep_quality: null, exercise_minutes: null, stress: null, updated_at: "2026-10-02T10:00:00Z" };
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const idle = { status: "idle" } as const;
const answers = (others: Record<string, { data: unknown; error: unknown }>) =>
  rpc.mockImplementation(async (name: string) => (name === "get_me" ? { data: ME, error: null } : name === "upsert_check_in" ? { data: ROW, error: null } : others[name]));

beforeEach(() => {
  rpc.mockReset();
  gate.routine = "shown";
});

describe("saveCheckIn with routine ticks", () => {
  it("the check-in, then the day's ticks in one call; the saved ids come back", async () => {
    answers({ set_routine_ticks: { data: [{ item_id: A }, { item_id: B }], error: null } });
    const state = await saveCheckIn(idle, form({ mood: "4", expected_updated_at: "", routine: JSON.stringify([A, B, A]) }));
    expect(state).toEqual({ status: "saved", checkIn: ROW, routine: [A, B] });
    const names = rpc.mock.calls.map((c) => c[0]);
    expect(names.indexOf("set_routine_ticks")).toBeGreaterThan(names.indexOf("upsert_check_in"));
    expect(rpc).toHaveBeenCalledWith("set_routine_ticks", { p_date: "2026-10-02", p_item_ids: [A, B] });
  });

  it("an empty list clears the day's", async () => {
    answers({ set_routine_ticks: { data: [], error: null } });
    expect(await saveCheckIn(idle, form({ mood: "4", expected_updated_at: "", routine: "[]" }))).toEqual({ status: "saved", checkIn: ROW, routine: [] });
  });

  it("tags and ticks together: both, tags first", async () => {
    answers({ set_check_in_tags: { data: [{ tag: "Rain" }], error: null }, set_routine_ticks: { data: [{ item_id: A }], error: null } });
    expect(await saveCheckIn(idle, form({ mood: "4", expected_updated_at: "", tags: '["Rain"]', routine: JSON.stringify([A]) }))).toEqual({ status: "saved", checkIn: ROW, tags: ["Rain"], routine: [A] });
    const names = rpc.mock.calls.map((c) => c[0]);
    expect(names.indexOf("set_routine_ticks")).toBeGreaterThan(names.indexOf("set_check_in_tags"));
  });

  it("the ticks failing leaves the check-in saved, and says so", async () => {
    answers({ set_routine_ticks: { data: null, error: { message: "not_found" } } });
    expect(await saveCheckIn(idle, form({ mood: "4", expected_updated_at: "", routine: JSON.stringify([A]) }))).toEqual({ status: "saved", checkIn: ROW, routineSaved: false });
  });

  it("junk in the field: nothing is sent at all", async () => {
    answers({});
    expect(await saveCheckIn(idle, form({ mood: "4", expected_updated_at: "", routine: '["Morning meds"]' }))).toEqual({ status: "error", error: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("routine-live off: the field is ignored", async () => {
    gate.routine = "hidden";
    answers({});
    expect(await saveCheckIn(idle, form({ mood: "4", expected_updated_at: "", routine: JSON.stringify([A]) }))).toEqual({ status: "saved", checkIn: ROW });
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain("set_routine_ticks");
  });

  it("no field: no ticks call", async () => {
    answers({});
    await saveCheckIn(idle, form({ mood: "4", expected_updated_at: "" }));
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain("set_routine_ticks");
  });
});
