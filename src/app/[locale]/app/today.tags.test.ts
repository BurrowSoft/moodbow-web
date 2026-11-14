// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// saveCheckIn with the day's tags (UX, 11 Nov; the app's migration 029):
// checked before anything is sent, set after the check-in in one call, and the
// check-in stays saved when the tags fail.
const rpc = vi.fn();
const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc, from }) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/i18n/navigation", () => ({ redirect: () => undefined }));
const { saveCheckIn } = await import("./actions");

const ME = { profile: { time_zone: "Asia/Bangkok", onboarded_at: "x" }, consents: {}, today: "2026-10-02" };
const ROW = { local_date: "2026-10-02", mood: 4, sleep_hours: null, sleep_quality: null, exercise_minutes: null, stress: null, updated_at: "2026-10-02T10:00:00Z" };
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const idle = { status: "idle" } as const;
const answers = (tags: { data: unknown; error: unknown }) =>
  rpc.mockImplementation(async (name: string) => (name === "get_me" ? { data: ME, error: null } : name === "upsert_check_in" ? { data: ROW, error: null } : tags));

beforeEach(() => rpc.mockReset());

describe("saveCheckIn with tags", () => {
  it("the check-in, then the day's tags in one call; the saved tags come back", async () => {
    answers({ data: [{ tag: "Walk" }, { tag: "Rain" }], error: null });
    const state = await saveCheckIn(idle, form({ mood: "4", expected_updated_at: "", tags: '["Walk","Rain"]' }));
    expect(state).toEqual({ status: "saved", checkIn: ROW, tags: ["Walk", "Rain"] });
    const names = rpc.mock.calls.map((c) => c[0]);
    expect(names.indexOf("set_check_in_tags")).toBeGreaterThan(names.indexOf("upsert_check_in"));
    expect(rpc).toHaveBeenCalledWith("set_check_in_tags", { p_date: "2026-10-02", p_tags: ["Walk", "Rain"] });
  });
  it("an empty list clears the day's", async () => {
    answers({ data: [], error: null });
    expect(await saveCheckIn(idle, form({ mood: "4", expected_updated_at: "", tags: "[]" }))).toEqual({ status: "saved", checkIn: ROW, tags: [] });
    expect(rpc).toHaveBeenCalledWith("set_check_in_tags", { p_date: "2026-10-02", p_tags: [] });
  });
  it("the tags fail (consent withdrawn, a limit): the check-in stays saved, and the card is told", async () => {
    answers({ data: null, error: { message: "consent_required" } });
    expect(await saveCheckIn(idle, form({ mood: "4", expected_updated_at: "", tags: '["Walk"]' }))).toEqual({ status: "saved", checkIn: ROW, tagsSaved: false });
  });
  it("tags breaking a rule: refused before anything is sent", async () => {
    answers({ data: [], error: null });
    expect(await saveCheckIn(idle, form({ mood: "4", expected_updated_at: "", tags: JSON.stringify(["a", "b", "c", "d", "e", "f"]) }))).toEqual({ status: "error", error: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("no tags in the form (they didn't change): no tags call at all", async () => {
    answers({ data: [], error: null });
    expect(await saveCheckIn(idle, form({ mood: "4", expected_updated_at: "" }))).toEqual({ status: "saved", checkIn: ROW });
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain("set_check_in_tags");
  });
});
