// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CrisisKeywords } from "@/lib/safety/crisis";
import { monthsBefore, onThisDayDates, pickOnThisDay, type MomentRow } from "./onThisDay";

describe("monthsBefore: the same day, earlier; no rounding", () => {
  it("across months and years", () => {
    expect(monthsBefore("2026-10-21", 1)).toBe("2026-09-21");
    expect(monthsBefore("2026-10-21", 6)).toBe("2026-04-21");
    expect(monthsBefore("2026-10-21", 12)).toBe("2025-10-21");
    expect(monthsBefore("2026-01-15", 1)).toBe("2025-12-15");
  });

  it("a day that doesn't exist that month: none", () => {
    expect(monthsBefore("2026-03-31", 1)).toBeNull();
    expect(monthsBefore("2028-02-29", 12)).toBeNull();
    expect(monthsBefore("2026-08-31", 6)).toBeNull();
  });
});

describe("onThisDayDates", () => {
  it("a year, 6 months, a month ago, in that order (the rarer first)", () => {
    expect(onThisDayDates("2026-10-21")).toEqual([
      { kind: "year", date: "2025-10-21" },
      { kind: "sixMonths", date: "2026-04-21" },
      { kind: "month", date: "2026-09-21" },
    ]);
  });

  it("skips the dates that don't exist", () => {
    expect(onThisDayDates("2026-03-31").map((d) => d.kind)).toEqual(["year"]);
  });
});

const row = (over: Partial<MomentRow>): MomentRow => ({ id: "e", entry_date: "2026-09-21", body: "A good walk.", is_moment: true, created_at: "2026-09-21T10:00:00Z", ...over });
const KEYWORDS: CrisisKeywords = { version: 1, languages: { en: { match: "word", phrases: ["want to die"] } } };

describe("pickOnThisDay", () => {
  it("the rarer anniversary wins; within a day, the newest moment", () => {
    const rows = [
      row({ id: "month", entry_date: "2026-09-21" }),
      row({ id: "year-old", entry_date: "2025-10-21", created_at: "2025-10-21T08:00:00Z" }),
      row({ id: "year-new", entry_date: "2025-10-21", created_at: "2025-10-21T21:00:00Z" }),
    ];
    expect(pickOnThisDay(rows, "2026-10-21", KEYWORDS)).toMatchObject({ kind: "year", entry: { id: "year-new" } });
  });

  it("moments only; a plain entry never makes a card", () => {
    expect(pickOnThisDay([row({ is_moment: false })], "2026-10-21", KEYWORDS)).toBeNull();
  });

  it("an entry the crisis matcher flags is skipped, and the next one shows instead", () => {
    const rows = [row({ id: "hard", entry_date: "2025-10-21", body: "Some days I want to die." }), row({ id: "month" })];
    expect(pickOnThisDay(rows, "2026-10-21", KEYWORDS)).toMatchObject({ kind: "month", entry: { id: "month" } });
  });

  it("nothing on those days: no card", () => {
    expect(pickOnThisDay([row({ entry_date: "2026-09-20" })], "2026-10-21", KEYWORDS)).toBeNull();
  });
});
