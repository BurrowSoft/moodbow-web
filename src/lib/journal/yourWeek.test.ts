// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import contract from "../../../content/your-week.json";
import en from "@/messages/en.json";
import type { InsightRow } from "./insights";
import { PATTERN_RULES } from "./patterns";
import { YOUR_WEEK_RULES, yourWeek, type YourWeekMoment } from "./yourWeek";

// content/your-week.json: the app runs these same cases when its side is built,
// and takes the file over then (see its "about").
type Case = { name: string; today?: string; rows: InsightRow[]; moments: YourWeekMoment[]; expect: unknown };

describe("Your week: the contract", () => {
  it("the rules are the contract's", () => {
    expect(YOUR_WEEK_RULES).toEqual(contract.rules);
  });

  for (const c of contract.cases as unknown as Case[]) {
    it(c.name, () => {
      expect(yourWeek(c.rows, c.today ?? contract.today, c.moments)).toEqual(c.expect);
    });
  }

  it("the web's English is the contract's, word for word", () => {
    const name = (key: string) => `yourWeek${key[0].toUpperCase()}${key.slice(1)}`;
    const messages = en.insights as Record<string, string>;
    for (const [key, line] of Object.entries(contract.copy)) expect(messages[name(key)], key).toBe(line);
  });

  it("the copy keeps to its rules: no causes, advice, scores or diagnosis words", () => {
    const words = /because|improv|should|try to|better|worse|score|streak|missed|depress|anxi|disorder|symptom/i;
    for (const [key, line] of Object.entries(contract.copy)) expect(line, key).not.toMatch(words);
  });
});

// Each language's templates (messages' insights.yourWeek…) and the contract's
// English: no diagnosis word, in that language.
describe("Your week: no diagnosis words", () => {
  const lists = contract.diagnosisWords as Record<string, string[]>;
  it("the contract's English", () => {
    for (const [key, line] of Object.entries(contract.copy)) for (const word of lists.en) expect(line.toLowerCase(), key).not.toContain(word);
  });
  it.each(Object.keys(lists))("%s", (locale) => {
    const messages = JSON.parse(readFileSync(join(process.cwd(), "src", "messages", `${locale}.json`), "utf8")) as { insights: Record<string, string> };
    const lines = Object.entries(messages.insights).filter(([key]) => key.startsWith("yourWeek"));
    expect(lines.length, "the strings are there to check").toBe(Object.keys(contract.copy).length);
    for (const [key, line] of lines) for (const word of lists[locale]) expect(line.toLowerCase(), key).not.toContain(word);
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

// Contract v2 (UX 14 Nov; the Reviewer's checklist): every week of 4 to 7 check-ins, as a multiset of
// moods (no pattern, no moment), is hard or has exactly one "how it looked" line. Never no card.
describe("Your week v2: every week of 4-7 check-ins says something", () => {
  const multisets = (n: number, from = 1): number[][] => (n === 0 ? [[]] : [1, 2, 3, 4, 5].filter((m) => m >= from).flatMap((m) => multisets(n - 1, m).map((rest) => [m, ...rest])));
  const days = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];
  const weeks = [4, 5, 6, 7].flatMap((n) => multisets(n));

  it("all 736 of them: hard exactly when low*2 > n, or no good day and low*2 >= n; otherwise one look line", () => {
    expect(weeks).toHaveLength(70 + 126 + 210 + 330);
    const silent: string[] = [];
    for (const moods of weeks) {
      const rows = moods.map((mood, i) => ({ local_date: days[i], mood, sleep_hours: null, stress: null, exercise_minutes: null })) as unknown as InsightRow[];
      const n = moods.length;
      const low = moods.filter((m) => m <= 2).length;
      const good = moods.filter((m) => m >= 4).length;
      const hard = low * 2 > n || (good === 0 && low * 2 >= n);
      const week = yourWeek(rows, "2026-11-04", []);
      if (!week) {
        silent.push(moods.join(","));
        continue;
      }
      if (hard) expect(week, moods.join(",")).toEqual({ start: "2026-10-26", end: "2026-11-01", kind: "hard" });
      else {
        expect(week.kind, moods.join(",")).toBe("lines");
        const lines = week.kind === "lines" ? week.lines : [];
        expect(lines.map((l) => l.template), moods.join(",")).toHaveLength(1);
        expect(lines[0].template, moods.join(",")).toMatch(/^look(Steady|MoreGood|Mixed)$/);
      }
    }
    // Named, so a rule that leaves a week silent says which.
    expect(silent).toEqual([]);
  });

  it("the hard branch: no moment, no pattern, no lines, whatever else qualifies", () => {
    const rows = [2, 2, 3, 3].map((mood, i) => ({ local_date: days[i], mood, sleep_hours: i < 2 ? 5 : 8, stress: null, exercise_minutes: null })) as unknown as InsightRow[];
    expect(yourWeek(rows, "2026-11-04", [{ id: "m", entry_date: days[1] }])).toEqual({ start: "2026-10-26", end: "2026-11-01", kind: "hard" });
  });
});
