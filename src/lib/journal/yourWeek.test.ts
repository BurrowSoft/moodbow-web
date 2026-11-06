// @vitest-environment node
import { describe, expect, it } from "vitest";
import contract from "../../../content/your-week.json";
import type { InsightRow } from "./insights";
import { PATTERN_RULES } from "./patterns";
import { YOUR_WEEK_RULES, yourWeek, type YourWeekMoment } from "./yourWeek";

// content/your-week.json: the app runs these same cases when its side is built,
// and takes the file over then (see its "about").
type Case = { name: string; rows: InsightRow[]; moments: YourWeekMoment[]; expect: unknown };

describe("Your week: the contract", () => {
  it("the rules are the contract's", () => {
    expect(YOUR_WEEK_RULES).toEqual(contract.rules);
  });

  for (const c of contract.cases as unknown as Case[]) {
    it(c.name, () => {
      expect(yourWeek(c.rows, contract.today, c.moments)).toEqual(c.expect);
    });
  }

  it("the copy keeps to its rules: no causes, advice, scores or diagnosis words", () => {
    const words = /because|improv|should|try to|better|worse|score|streak|missed|depress|anxi|disorder|symptom/i;
    for (const [key, line] of Object.entries(contract.copy)) expect(line, key).not.toMatch(words);
  });
});

describe("Your week: which week", () => {
  const week = (start: string): InsightRow[] =>
    [0, 1, 2, 3].map((n) => {
      const d = new Date(`${start}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return { local_date: d.toISOString().slice(0, 10), mood: 5, sleep_hours: null, stress: null, exercise_minutes: null };
    });

  it("on a Monday, the week that ended yesterday", () => {
    expect(yourWeek(week("2026-10-26"), "2026-11-02", [])).toMatchObject({ start: "2026-10-26", end: "2026-11-01" });
  });

  it("on a Sunday, not the week still running", () => {
    expect(yourWeek(week("2026-10-26"), "2026-11-01", [])).toBeNull();
    expect(yourWeek(week("2026-10-19"), "2026-11-01", [])).toMatchObject({ start: "2026-10-19", end: "2026-10-25" });
  });

  it("across a month and year end", () => {
    expect(yourWeek(week("2026-12-28"), "2027-01-05", [])).toMatchObject({ start: "2026-12-28", end: "2027-01-03" });
  });
});

describe("Your week: Patterns' sides", () => {
  it("a sleep_hours string counts as its number, as in Patterns; the 7-hour line stays in the rule", () => {
    expect(PATTERN_RULES.sleepHoursAtLeast).toBe(7);
    const rows: InsightRow[] = [
      { local_date: "2026-10-26", mood: 5, sleep_hours: "7.0", stress: null, exercise_minutes: null },
      { local_date: "2026-10-27", mood: 5, sleep_hours: "7.5", stress: null, exercise_minutes: null },
      { local_date: "2026-10-28", mood: 3, sleep_hours: "6.5", stress: null, exercise_minutes: null },
      { local_date: "2026-10-29", mood: 3, sleep_hours: "6.5", stress: null, exercise_minutes: null },
    ];
    expect(yourWeek(rows, "2026-11-04", [])).toMatchObject({ lines: [{ template: "patternSleep" }, { template: "lookMoreGood" }], caption: true });
  });
});
