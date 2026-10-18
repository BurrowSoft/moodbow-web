// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// saveCheckIn with a mocked Supabase client: the date comes from get_me,
// the optimistic lock is passed through, and every RPC error maps to copy
// or a redirect.
const rpc = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const from = vi.fn(() => ({ select: () => ({ eq }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc, from }) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
class Redirect {
  constructor(public args: { href: string; locale: string }) {}
}
vi.mock("@/i18n/navigation", () => ({
  redirect: (args: Redirect["args"]) => {
    throw new Redirect(args);
  },
}));

const { saveCheckIn } = await import("./actions");

const ME = { profile: { time_zone: "Asia/Bangkok", onboarded_at: "x" }, consents: {}, today: "2026-10-02" };
const ROW = { local_date: "2026-10-02", mood: 4, sleep_hours: 7.5, sleep_quality: "good", exercise_minutes: 30, stress: 2, updated_at: "2026-10-02T10:00:00Z" };
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const idle = { status: "idle" } as const;
const rpcAnswers = (upsert: { data: unknown; error: unknown }) =>
  rpc.mockImplementation(async (name: string) => (name === "get_me" ? { data: ME, error: null } : upsert));

beforeEach(() => {
  rpc.mockReset();
  maybeSingle.mockReset();
});

describe("saveCheckIn", () => {
  it("saves for the profile's today with the card's lock, and returns the row", async () => {
    rpcAnswers({ data: ROW, error: null });
    const state = await saveCheckIn(
      idle,
      form({ mood: "4", sleep_hours: "7.5", sleep_quality: "good", exercise_minutes: "30", stress: "2", expected_updated_at: "2026-10-01T09:00:00Z" }),
    );
    expect(state).toEqual({ status: "saved", checkIn: ROW });
    expect(rpc).toHaveBeenCalledWith("upsert_check_in", {
      p_date: "2026-10-02",
      p_mood: 4,
      p_sleep_hours: 7.5,
      p_sleep_quality: "good",
      p_exercise_minutes: 30,
      p_stress: 2,
      p_expected_updated_at: "2026-10-01T09:00:00Z",
    });
  });

  it("an offline copy synced later is saved for the day it was made", async () => {
    rpcAnswers({ data: ROW, error: null });
    await saveCheckIn(idle, form({ mood: "4", local_date: "2026-10-01" }));
    expect(rpc.mock.calls.find((c) => c[0] === "upsert_check_in")![1].p_date).toBe("2026-10-01");
  });

  it("a malformed date falls back to today", async () => {
    rpcAnswers({ data: ROW, error: null });
    await saveCheckIn(idle, form({ mood: "4", local_date: "yesterday" }));
    expect(rpc.mock.calls.find((c) => c[0] === "upsert_check_in")![1].p_date).toBe("2026-10-02");
  });

  describe("an offline copy with no base version (decision 72)", () => {
    const pending = { mood: "4", sleep_hours: "7.5", sleep_quality: "good", exercise_minutes: "30", stress: "2", local_date: "2026-10-02", expected_updated_at: "", from_pending: "1" };

    it("the day is still empty: saved", async () => {
      rpcAnswers({ data: ROW, error: null });
      maybeSingle.mockResolvedValue({ data: null, error: null });
      expect(await saveCheckIn(idle, form(pending))).toEqual({ status: "saved", checkIn: ROW });
      expect(rpc).toHaveBeenCalledWith("upsert_check_in", expect.anything());
    });

    it("the day has this same check-in (an earlier answer was lost): saved, nothing written", async () => {
      rpcAnswers({ data: ROW, error: null });
      maybeSingle.mockResolvedValue({ data: { ...ROW, sleep_hours: "7.5" }, error: null });
      expect(await saveCheckIn(idle, form(pending))).toMatchObject({ status: "saved" });
      expect(rpc).not.toHaveBeenCalledWith("upsert_check_in", expect.anything());
    });

    it("another device checked in meanwhile: stale with its row, never overwritten", async () => {
      rpcAnswers({ data: ROW, error: null });
      const theirs = { ...ROW, mood: 1 };
      maybeSingle.mockResolvedValue({ data: theirs, error: null });
      expect(await saveCheckIn(idle, form(pending))).toEqual({ status: "error", error: "stale", checkIn: theirs });
      expect(rpc).not.toHaveBeenCalledWith("upsert_check_in", expect.anything());
    });

    it("the read fails: generic (the copy is kept for a retry)", async () => {
      rpcAnswers({ data: ROW, error: null });
      maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
      expect(await saveCheckIn(idle, form(pending))).toEqual({ status: "error", error: "generic" });
    });

    it("the live card's first check-in doesn't read first (last write wins, as on the app)", async () => {
      rpcAnswers({ data: ROW, error: null });
      await saveCheckIn(idle, form({ ...pending, from_pending: "" }));
      expect(maybeSingle).not.toHaveBeenCalled();
    });
  });

  it("a first check-in sends no lock (null)", async () => {
    rpcAnswers({ data: ROW, error: null });
    await saveCheckIn(idle, form({ mood: "4", expected_updated_at: "" }));
    expect(rpc.mock.calls.find((c) => c[0] === "upsert_check_in")![1].p_expected_updated_at).toBeNull();
  });

  it("an invalid card never reaches the RPC", async () => {
    expect(await saveCheckIn(idle, form({ mood: "9" }))).toEqual({ status: "error", error: "generic" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stale_write: returns the latest row so the card can show it", async () => {
    rpcAnswers({ data: null, error: { message: "stale_write" } });
    maybeSingle.mockResolvedValue({ data: ROW });
    expect(await saveCheckIn(idle, form({ mood: "2", expected_updated_at: "2026-10-02T08:00:00Z" }))).toEqual({ status: "error", error: "stale", checkIn: ROW });
    expect(eq).toHaveBeenLastCalledWith("local_date", "2026-10-02");
  });

  it("stale_write, but the day already holds these exact values (an earlier answer was lost): saved", async () => {
    rpcAnswers({ data: null, error: { message: "stale_write" } });
    maybeSingle.mockResolvedValue({ data: ROW });
    const same = { mood: "4", sleep_hours: "7.5", sleep_quality: "good", exercise_minutes: "30", stress: "2", expected_updated_at: "2026-10-02T08:00:00Z" };
    expect(await saveCheckIn(idle, form(same))).toEqual({ status: "saved", checkIn: ROW });
  });

  it("stale_write on an older day reloads that day", async () => {
    rpcAnswers({ data: null, error: { message: "stale_write" } });
    maybeSingle.mockResolvedValue({ data: null });
    await saveCheckIn(idle, form({ mood: "2", local_date: "2026-09-30", expected_updated_at: "2026-09-30T08:00:00Z" }));
    expect(eq).toHaveBeenLastCalledWith("local_date", "2026-09-30");
  });

  it("maps the other codes", async () => {
    rpcAnswers({ data: null, error: { message: "date_in_future" } });
    expect(await saveCheckIn(idle, form({ mood: "3" }))).toEqual({ status: "error", error: "dateInFuture" });
    rpcAnswers({ data: null, error: { message: "something else" } });
    expect(await saveCheckIn(idle, form({ mood: "3" }))).toEqual({ status: "error", error: "generic" });
  });

  it("consent_required → Consent", async () => {
    rpcAnswers({ data: null, error: { message: "consent_required" } });
    const result = await saveCheckIn(idle, form({ mood: "3" })).catch((e) => e);
    expect((result as Redirect).args).toEqual({ href: "/consent", locale: "en" });
  });
});
