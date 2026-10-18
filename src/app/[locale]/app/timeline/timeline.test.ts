// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dayLabel, groupByMonth, isIsoDate, monthLabel } from "@/lib/journal/timeline";

// The Timeline's helpers, and loadTimeline against a mocked Supabase client.
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
let momentsLive = true;
vi.mock("@/lib/conditions", () => ({ conditionMet: (id: string) => id === "timeline-moments-rpc" && momentsLive }));
const { loadTimeline } = await import("./actions");

const day = (local_date: string) => ({ local_date, check_in: null, entries: [], entry_count: 0 });

beforeEach(() => {
  rpc.mockReset();
  momentsLive = true;
});

describe("timeline helpers", () => {
  it("groups days under their month, keeping their order", () => {
    expect(groupByMonth([day("2026-10-02"), day("2026-10-01"), day("2026-09-30"), day("2026-08-01")]).map((g) => [g.month, g.days.length])).toEqual([
      ["2026-10", 2],
      ["2026-09", 1],
      ["2026-08", 1],
    ]);
    expect(groupByMonth([])).toEqual([]);
  });

  it("labels months and days in the region's format (decision 89)", () => {
    expect(monthLabel("2026-10", "en-US")).toBe("October 2026");
    expect(dayLabel("2026-10-02", "en-US")).toBe("Fri, Oct 2");
    expect(dayLabel("2026-10-02", "en-GB")).toBe("Fri 2 Oct");
  });

  it("isIsoDate accepts real dates only", () => {
    expect(isIsoDate("2026-10-02")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "2026-10-2", "yesterday", "2026-10-02T00:00"]) expect(isIsoDate(bad), bad).toBe(false);
  });
});

describe("loadTimeline", () => {
  it("All days: 30 days before the given one, no moments flag", async () => {
    rpc.mockResolvedValue({ data: [day("2026-09-30")], error: null });
    expect(await loadTimeline("2026-10-01", false)).toEqual({ status: "ok", days: [day("2026-09-30")], done: true });
    expect(rpc).toHaveBeenCalledWith("get_timeline", { p_before: "2026-10-01", p_limit: 30 });
  });

  it("Moments: the migration 005 flag; a full page means there may be more", async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: 30 }, (_, i) => day(`2026-09-${String(30 - i).padStart(2, "0")}`)), error: null });
    const page = await loadTimeline(null, true);
    expect(page).toMatchObject({ status: "ok", done: false });
    expect(rpc).toHaveBeenCalledWith("get_timeline", { p_before: null, p_limit: 30, p_moments_only: true });
  });

  it("Moments before migration 005 is live: refused here, never sent (reviewer #15)", async () => {
    momentsLive = false;
    expect(await loadTimeline(null, true)).toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("an error (or the function not existing yet) is an error; a bad cursor never reaches the RPC", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function get_timeline(...) does not exist" } });
    expect(await loadTimeline(null, true)).toEqual({ status: "error" });
    rpc.mockReset();
    expect(await loadTimeline("soon", false)).toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
