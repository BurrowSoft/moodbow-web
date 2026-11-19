import { describe, expect, it } from "vitest";
import type { InsightRow } from "@/lib/journal/insights";
import { isReviewYear, opening, yearReview } from "./yearReview";

const row = (date: string, mood: number, over: Partial<InsightRow> = {}): InsightRow => ({ local_date: date, mood, sleep_hours: null, stress: null, exercise_minutes: null, ...over });
const month = (ym: string, n: number, mood = 3, over: Partial<InsightRow> = {}) => Array.from({ length: n }, (_, i) => row(`${ym}-${String(i + 1).padStart(2, "0")}`, mood, over));

describe("yearReview", () => {
  it("check-in days per month and in all; only that year's", () => {
    const r = yearReview("2026", [...month("2026-01", 3), ...month("2026-03", 6), ...month("2025-12", 9)], 0, []);
    expect(r.daysByMonth).toEqual([3, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.days).toBe(9);
  });
  it("mood by month: a month counts with 5 check-ins; 2 months make a chart", () => {
    const r = yearReview("2026", [...month("2026-01", 5, 4), ...month("2026-02", 4, 1), ...month("2026-03", 5, 2)], 0, []);
    expect(r.moodByMonth.slice(0, 3)).toEqual([4, null, 2]);
    expect(r.moodEnough).toBe(true);
    expect(yearReview("2026", month("2026-01", 20), 0, []).moodEnough).toBe(false);
  });
  it("the three factors with 14 or more values each, else none", () => {
    const rows = month("2026-05", 14, 3, { sleep_hours: 7.5, exercise_minutes: 30, stress: null });
    const r = yearReview("2026", rows, 0, []);
    expect(r.factors).toEqual({ sleep: 7.5, movement: 30, stress: null });
    expect(yearReview("2026", rows.slice(0, 13), 0, []).factors.sleep).toBeNull();
  });
  it("entries counted; the year's moments by date, oldest first, with their opening words", () => {
    const r = yearReview("2026", [], 12, [
      { id: "b", entry_date: "2026-06-02", body: "Second.\n\nMore." },
      { id: "a", entry_date: "2026-02-01", body: "First." },
      { id: "c", entry_date: "2025-12-31", body: "Last year." },
      { id: "d", entry_date: "2026-03-03", body: "   " },
    ]);
    expect(r.entries).toBe(12);
    expect(r.moments).toEqual([
      { id: "a", date: "2026-02-01", opening: "First." },
      { id: "b", date: "2026-06-02", opening: "Second. More." },
    ]);
  });
});

describe("opening: about 80 characters, cut at a word", () => {
  it("short: as written, on one line", () => {
    expect(opening("A walk\nby the river.")).toBe("A walk by the river.");
  });
  it("long: cut at the last word that fits, with an ellipsis", () => {
    const text = "word ".repeat(30).trim();
    const out = opening(text);
    expect(out.endsWith("…")).toBe(true);
    expect([...out].length).toBeLessThanOrEqual(81);
    expect(out).not.toMatch(/wor…$/);
  });
  it("one long word: cut at 80", () => {
    expect([...opening("a".repeat(200))].length).toBe(81);
  });
});

describe("isReviewYear", () => {
  it("a year up to today's", () => {
    expect(["2026", "2020", "2027", "26", "2026-01", undefined].map((y) => isReviewYear(y, "2026-11-11"))).toEqual([true, true, false, false, false, false]);
  });
});
