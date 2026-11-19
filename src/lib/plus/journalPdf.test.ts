import { describe, expect, it } from "vitest";
import type { PrintDay } from "@/lib/journal/printMonth";
import { byMonth, parsePdfPeriod, pdfCounts, pdfRange, periodsWithData } from "./journalPdf";

const TODAY = "2026-11-11";
const day = (date: string, checkIn: boolean, entries = 0): PrintDay => ({
  date,
  checkIn: checkIn ? { local_date: date, mood: 3, sleep_hours: null, exercise_minutes: null, stress: null } : null,
  entries: Array.from({ length: entries }, (_, i) => ({ id: `${date}-${i}`, body: "x", isMoment: false })),
});

describe("parsePdfPeriod: a month or a year, never the future", () => {
  it("YYYY-MM and YYYY up to today's", () => {
    expect(parsePdfPeriod("2026-10", TODAY)).toEqual({ kind: "month", key: "2026-10" });
    expect(parsePdfPeriod("2026-11", TODAY)).toEqual({ kind: "month", key: "2026-11" });
    expect(parsePdfPeriod("2026", TODAY)).toEqual({ kind: "year", key: "2026" });
  });
  it("anything else: none", () => {
    for (const s of ["2026-12", "2027", "2026-13", "26", "2026-1", "", undefined, ["2026"]]) expect(parsePdfPeriod(s, TODAY), String(s)).toBeNull();
  });
});

describe("the period's dates", () => {
  it("a month's first and last day; a year's", () => {
    expect(pdfRange({ kind: "month", key: "2024-02" })).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(pdfRange({ kind: "year", key: "2026" })).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("the picker lists only months and years with something, newest first", () => {
    expect(periodsWithData(["2026-10-03", "2025-12-31", "2026-10-30", "2026-01-02", "junk"])).toEqual({ months: ["2026-10", "2026-01", "2025-12"], years: ["2026", "2025"] });
  });
});

describe("a year's layout", () => {
  it("one heading per month, in order", () => {
    const days = [day("2026-01-05", true), day("2026-01-09", false, 1), day("2026-03-01", true, 2)];
    expect(byMonth(days).map((m) => [m.month, m.days.length])).toEqual([
      ["2026-01", 2],
      ["2026-03", 1],
    ]);
  });
  it("the cover's counts: days with a check-in, and entries", () => {
    expect(pdfCounts([day("2026-01-05", true), day("2026-01-09", false, 1), day("2026-03-01", true, 2)])).toEqual({ days: 2, entries: 3 });
  });
});
