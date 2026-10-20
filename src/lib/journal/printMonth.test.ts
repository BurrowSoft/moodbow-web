// @vitest-environment node
import { describe, expect, it } from "vitest";
import { printDays } from "./printMonth";

const ci = (local_date: string, mood: number) => ({ local_date, mood, sleep_hours: 7, exercise_minutes: 30, stress: 2 });
const entry = (id: string, entry_date: string, created_at: string, body = `Entry ${id}`, is_moment = false) => ({ id, entry_date, body, is_moment, created_at });

describe("printDays (1.1 N)", () => {
  it("only days with something, oldest first; entries in the order written", () => {
    const days = printDays(
      [ci("2026-10-05", 4), ci("2026-10-01", 2)],
      [entry("b", "2026-10-03", "2026-10-03T20:00:00Z"), entry("a", "2026-10-03", "2026-10-03T08:00:00Z", "Morning.", true), entry("c", "2026-10-05", "2026-10-05T09:00:00Z")],
    );
    expect(days.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-03", "2026-10-05"]);
    expect(days[1]).toEqual({ date: "2026-10-03", checkIn: null, entries: [{ id: "a", body: "Morning.", isMoment: true }, { id: "b", body: "Entry b", isMoment: false }] });
    expect(days[2].checkIn?.mood).toBe(4);
  });

  it("blank entries and impossible moods are left out; an empty month is []", () => {
    expect(printDays([ci("2026-10-01", 0)], [entry("x", "2026-10-02", "t", "   ")])).toEqual([]);
    expect(printDays([], [])).toEqual([]);
  });
});
