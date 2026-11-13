import { describe, expect, it } from "vitest";
import type { InsightRow } from "@/lib/journal/insights";
import { MORE_PATTERN_IDS, morePatterns, moreWindowStart } from "./morePatterns";

const TODAY = "2026-11-11"; // a Wednesday
const day = (date: string, mood: number, over: Partial<InsightRow> = {}): InsightRow => ({ local_date: date, mood, sleep_hours: 7, stress: 2, exercise_minutes: 20, ...over });
// The 28 days ending today: weekdays mood 4, weekends mood 2.
const fourWeeks = Array.from({ length: 28 }, (_, i) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - i);
  const date = d.toISOString().slice(0, 10);
  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
  return day(date, weekend ? 2 : 4);
});
const by = (ps: ReturnType<typeof morePatterns>, id: string) => ps.find((p) => p.id === id)!;

describe("morePatterns: today's rules over a longer period", () => {
  it("the fixed order, never sorted by size", () => {
    expect(morePatterns(fourWeeks, TODAY, "year", new Set()).map((p) => p.id)).toEqual(MORE_PATTERN_IDS);
  });
  it("weekdays vs weekends: Saturday and Sunday are the weekend", () => {
    const p = by(morePatterns(fourWeeks, TODAY, "year", new Set()), "weekdays");
    expect(p).toMatchObject({ state: "shown", a: { days: 20, mood: 4 }, b: { days: 8, mood: 2 } });
  });
  it("writing days vs the rest, by the entry's date", () => {
    const written = new Set(fourWeeks.filter((r) => r.mood === 4).map((r) => r.local_date));
    expect(by(morePatterns(fourWeeks, TODAY, "year", written), "writing")).toMatchObject({ state: "shown", a: { mood: 4 }, b: { mood: 2 } });
    // Every day written: one side is empty, so not enough.
    expect(by(morePatterns(fourWeeks, TODAY, "year", new Set(fourWeeks.map((r) => r.local_date))), "writing").state).toBe("not_enough");
  });
  it("a gap under 0.5 is about the same, 0.5 or more is shown (rounded first: 4.1 − 3.6 is 0.5)", () => {
    const rows = [...Array.from({ length: 10 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, "0")}`, i < 9 ? 4 : 5)), ...Array.from({ length: 10 }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, "0")}`, i < 6 ? 4 : 3))];
    const written = new Set(rows.slice(0, 10).map((r) => r.local_date));
    const p = by(morePatterns(rows, TODAY, "year", written), "writing");
    expect(p).toMatchObject({ a: { mood: 4.1 }, b: { mood: 3.6 } });
    expect(p.state).toBe("shown");
  });
  it("fewer than 14 check-ins in the period, or under 5 on a side: nothing", () => {
    expect(morePatterns(fourWeeks.slice(0, 13), TODAY, "year", new Set()).every((p) => p.state === "not_enough")).toBe(true);
    const fewWeekends = fourWeeks.filter((r) => r.mood === 4).concat(fourWeeks.filter((r) => r.mood === 2).slice(0, 4));
    expect(by(morePatterns(fewWeekends, TODAY, "year", new Set()), "weekdays").state).toBe("not_enough");
  });
  it("the last 12 months, or all time", () => {
    const old = Array.from({ length: 20 }, (_, i) => day(`2024-01-${String(i + 1).padStart(2, "0")}`, 3));
    expect(morePatterns(old, TODAY, "year", new Set()).every((p) => p.state === "not_enough")).toBe(true);
    // 1–20 Jan 2024: 15 weekdays and 5 weekend days, all mood 3.
    expect(by(morePatterns(old, TODAY, "all", new Set()), "weekdays").state).toBe("same");
    expect(moreWindowStart("year", TODAY)).toBe("2025-11-12");
    expect(moreWindowStart("all", TODAY)).toBeNull();
  });
});
