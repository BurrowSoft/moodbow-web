import { describe, expect, it } from "vitest";
import type { InsightRow } from "@/lib/journal/insights";
import { isLongRange, longRangeStart, longSummary, periodsFor } from "./longRange";

const TODAY = "2026-11-11";
// n check-ins in a month (days 1..n), all with the same values.
const month = (ym: string, n: number, mood = 3, sleep: number | null = 7): InsightRow[] =>
  Array.from({ length: n }, (_, i) => ({ local_date: `${ym}-${String(i + 1).padStart(2, "0")}`, mood, sleep_hours: sleep, stress: 2, exercise_minutes: 20 }));

describe("periodsFor: which months or quarters a chart shows", () => {
  it("Year: the 12 months ending with today's", () => {
    const { unit, periods } = periodsFor("year", TODAY, null);
    expect(unit).toBe("month");
    expect(periods).toHaveLength(12);
    expect(periods[0]).toEqual({ start: "2025-12-01", end: "2026-01-01" });
    expect(periods[11]).toEqual({ start: "2026-11-01", end: "2026-12-01" });
  });
  it("All time: by month from the first check-in, up to 24 months", () => {
    const { unit, periods } = periodsFor("all", TODAY, "2024-12-20");
    expect(unit).toBe("month");
    expect(periods).toHaveLength(24);
    expect(periods[0].start).toBe("2024-12-01");
  });
  it("All time past 24 months: by quarter, from the first check-in's quarter", () => {
    const { unit, periods } = periodsFor("all", TODAY, "2024-11-30");
    expect(unit).toBe("quarter");
    expect(periods[0]).toEqual({ start: "2024-10-01", end: "2025-01-01" });
    expect(periods.at(-1)).toEqual({ start: "2026-10-01", end: "2027-01-01" });
    expect(periods).toHaveLength(9);
  });
  it("no check-ins yet: today's month only", () => {
    expect(periodsFor("all", TODAY, null).periods).toEqual([{ start: "2026-11-01", end: "2026-12-01" }]);
  });
});

describe("longSummary: one point per period, today's wording rules", () => {
  it("a month counts with 5 or more check-ins; fewer is a gap", () => {
    const rows = [...month("2026-09", 5, 4), ...month("2026-10", 4, 2), ...month("2026-11", 6, 3)];
    const s = longSummary(rows, TODAY, "year", "mood", "2026-09-01");
    expect(s.points.slice(-3)).toEqual([4, null, 3]);
    expect(s.enough).toBe(true);
    // The average is the counted months' check-ins only: (5×4 + 6×3) / 11.
    expect(s.average).toBe(3.5);
  });
  it("fewer than 2 counted periods: not enough", () => {
    const s = longSummary(month("2026-11", 20), TODAY, "year", "mood", "2026-11-01");
    expect(s.enough).toBe(false);
    expect(s.average).toBeNull();
    expect(s.change).toBeNull();
  });
  it("a quarter counts with 15", () => {
    const rows = [...month("2024-01", 14), ...month("2025-01", 15), ...month("2025-04", 15)];
    const s = longSummary(rows, TODAY, "all", "mood", "2024-01-01");
    expect(s.unit).toBe("quarter");
    expect(s.points[0]).toBeNull();
    expect(s.points[4]).toBe(3);
  });
  it("Year's change vs the 12 months before, only when those have 2 counted months", () => {
    const thisYear = [...month("2026-10", 5, 4), ...month("2026-11", 5, 4)];
    const before = [...month("2025-10", 5, 3), ...month("2025-11", 5, 3)];
    expect(longSummary([...before, ...thisYear], TODAY, "year", "mood", "2025-10-01").change).toBe(1);
    expect(longSummary([...month("2025-11", 5, 3), ...thisYear], TODAY, "year", "mood", "2025-11-01").change).toBeNull();
    // All time never has one.
    expect(longSummary([...before, ...thisYear], TODAY, "all", "mood", "2025-10-01").change).toBeNull();
  });
  it("a missing value isn't counted (sleep left out)", () => {
    const rows = [...month("2026-10", 5, 3, null), ...month("2026-11", 5, 3, null)];
    expect(longSummary(rows, TODAY, "year", "sleep", "2026-10-01").enough).toBe(false);
    expect(longSummary(rows, TODAY, "year", "mood", "2026-10-01").enough).toBe(true);
  });
});

describe("the reads and the range names", () => {
  it("Year reads 24 months; All time everything", () => {
    expect(longRangeStart("year", TODAY)).toBe("2024-12-01");
    expect(longRangeStart("all", TODAY)).toBeNull();
  });
  it("only year and all are Plus ranges", () => {
    expect(["year", "all", "week", "3months", "x"].map(isLongRange)).toEqual([true, true, false, false, false]);
  });
});
