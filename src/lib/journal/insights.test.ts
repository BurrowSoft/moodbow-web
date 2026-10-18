import { describe, expect, it } from "vitest";
import { isRange, previousRangeStart, rangeDays, roundFor, summarize, type InsightRow } from "./insights";

const row = (local_date: string, mood: number, extra: Partial<InsightRow> = {}): InsightRow => ({ local_date, mood, sleep_hours: null, stress: null, exercise_minutes: null, ...extra });

describe("ranges (rolling, ending today)", () => {
  it("a week is today and the 6 days before; month 30, 3 months 90", () => {
    const week = rangeDays("2026-10-02", "week");
    expect(week).toHaveLength(7);
    expect(week[0]).toBe("2026-09-26");
    expect(week[6]).toBe("2026-10-02");
    expect(rangeDays("2026-10-02", "month")).toHaveLength(30);
    expect(rangeDays("2026-03-01", "3months")[0]).toBe("2025-12-02");
  });

  it("loads from the start of the previous range", () => {
    expect(previousRangeStart("2026-10-02", "week")).toBe("2026-09-19");
  });

  it("isRange accepts only the three tabs", () => {
    expect(["week", "month", "3months"].every(isRange)).toBe(true);
    expect(isRange("year")).toBe(false);
    // Inherited names must not pass (reviewer #16: ?range=toString was a 500).
    for (const inherited of ["toString", "__proto__", "constructor", "hasOwnProperty", "valueOf"]) expect(isRange(inherited), inherited).toBe(false);
    expect(isRange(undefined)).toBe(false);
  });
});

describe("summarize", () => {
  it("fewer than 3 points: not enough, no average", () => {
    const s = summarize([row("2026-10-01", 4), row("2026-10-02", 5)], "2026-10-02", "week", "mood");
    expect(s).toMatchObject({ enough: false, average: null, change: null });
    expect(s.points.filter((p) => p !== null)).toEqual([4, 5]);
  });

  it("averages only the days with a value (never counting a gap as 0)", () => {
    const rows = [row("2026-09-27", 2, { sleep_hours: "7.5" }), row("2026-09-30", 3, { sleep_hours: 6 }), row("2026-10-02", 5)];
    expect(summarize(rows, "2026-10-02", "week", "mood").average).toBe(3.3);
    // Sleep: only 2 of the 3 days have hours → not enough.
    expect(summarize(rows, "2026-10-02", "week", "sleep").enough).toBe(false);
  });

  it("the change vs the previous range, rounded, signed; none without 3 points before", () => {
    const now = [row("2026-09-28", 4), row("2026-09-30", 4), row("2026-10-02", 5)];
    const before = [row("2026-09-20", 3), row("2026-09-22", 4), row("2026-09-24", 4)];
    expect(summarize([...now, ...before], "2026-10-02", "week", "mood")).toMatchObject({ average: 4.3, change: 0.6 });
    expect(summarize(now, "2026-10-02", "week", "mood").change).toBeNull();
    const worse = [row("2026-09-20", 5), row("2026-09-22", 5), row("2026-09-24", 5)];
    expect(summarize([...now, ...worse], "2026-10-02", "week", "mood").change).toBe(-0.7);
  });

  it("no change is 0 ('Same as…', decision 98), never -0", () => {
    const now = [row("2026-09-28", 4), row("2026-09-30", 4), row("2026-10-02", 4)];
    const before = [row("2026-09-20", 4), row("2026-09-22", 4), row("2026-09-24", 4.02)];
    const change = summarize([...now, ...before], "2026-10-02", "week", "mood").change;
    expect(change).toBe(0);
    expect(Object.is(change, -0)).toBe(false);
  });

  it("exercise 0 ('None') is a value, not a gap (Mobile Dev)", () => {
    const rows = [row("2026-09-28", 3, { exercise_minutes: 0 }), row("2026-09-29", 3, { exercise_minutes: 0 }), row("2026-09-30", 3, { exercise_minutes: 30 })];
    expect(summarize(rows, "2026-10-02", "week", "exercise")).toMatchObject({ enough: true, average: 10 });
  });

  it("exercise in whole minutes", () => {
    const rows = [row("2026-09-28", 3, { exercise_minutes: 15 }), row("2026-09-29", 3, { exercise_minutes: 30 }), row("2026-09-30", 3, { exercise_minutes: 0 })];
    expect(summarize(rows, "2026-10-02", "week", "exercise")).toMatchObject({ enough: true, average: 15 });
    expect(roundFor("exercise", 22.5)).toBe(23);
    expect(roundFor("sleep", 7.25)).toBe(7.3);
  });
});
