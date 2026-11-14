// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// loadTimeline adds each day's tags (tags-live) in one read after get_timeline.
let live = "live";
let tagAnswer: { data: unknown; error: unknown } = { data: [], error: null };
const inCall = vi.fn();
const DAYS = [
  { local_date: "2026-10-02", check_in: null, entries: [], entry_count: 0 },
  { local_date: "2026-10-01", check_in: null, entries: [], entry_count: 0 },
];
const client = {
  rpc: async () => ({ data: DAYS.map((d) => ({ ...d })), error: null }),
  from: () => ({ select: () => ({ in: (...a: unknown[]) => (inCall(...a), { order: async () => tagAnswer }) }) }),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/lib/conditions", () => ({ pageGate: (id: string) => (id === "tags-live" ? live : "live") }));
const { loadTimeline } = await import("./actions");

beforeEach(() => {
  live = "live";
  tagAnswer = { data: [], error: null };
  inCall.mockClear();
});

describe("loadTimeline: the days' tags", () => {
  it("one read for the page's dates; each day gets its tags in order, or none", async () => {
    tagAnswer = { data: [{ local_date: "2026-10-02", tag: "Walk" }, { local_date: "2026-10-02", tag: "Rain" }], error: null };
    const page = await loadTimeline(null, false);
    expect(inCall).toHaveBeenCalledWith("local_date", ["2026-10-02", "2026-10-01"]);
    expect(page.status === "ok" && page.days.map((d) => d.tags)).toEqual([["Walk", "Rain"], []]);
  });
  it("a failed read: the days without tags (no chips), never an error", async () => {
    tagAnswer = { data: null, error: { message: "relation does not exist" } };
    const page = await loadTimeline(null, false);
    expect(page.status).toBe("ok");
    expect(page.status === "ok" && page.days.every((d) => d.tags === undefined)).toBe(true);
  });
  it("tags off: no read at all", async () => {
    live = "hidden";
    await loadTimeline(null, false);
    expect(inCall).not.toHaveBeenCalled();
  });
});
