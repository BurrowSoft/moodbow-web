// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CrisisKeywords } from "@/lib/safety/crisis";
import { monthsBefore, onThisDayDates, pickOnThisDay, type MomentRow } from "./onThisDay";
import messages from "@/messages/en.json";
import contract from "../../../content/contracts/on-this-day.json";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";

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

// The shared contract (moodbow-app supabase/contracts/on-this-day.json): the
// app runs the same cases, so both pick the same memory. With the real crisis
// list, every language (crisis-keywords rule 5).
describe("the on-this-day.json contract (v1)", () => {
  it("is version 1", () => {
    expect(contract.version).toBe(1);
  });
  it.each(contract.monthsBefore)("monthsBefore($today, $months) = $expected", ({ today, months, expected }) => {
    expect(monthsBefore(today, months)).toBe(expected);
  });
  it.each(contract.dates)("onThisDayDates($today)", ({ today, expected }) => {
    expect(onThisDayDates(today)).toEqual(expected);
  });
  it.each(contract.pick)("pick: $name", ({ today, entries, expected }) => {
    const got = pickOnThisDay(entries as MomentRow[], today, CRISIS_KEYWORDS);
    expect(got && { kind: got.kind, id: got.entry.id }).toEqual(expected);
  });
  it("the labels are ours", () => {
    expect(contract.labels).toMatchObject({ year: messages.timeline.onThisDayYear, sixMonths: messages.timeline.onThisDay6Months, month: messages.timeline.onThisDayMonth, dismiss: messages.timeline.onThisDayDismiss });
  });
});
