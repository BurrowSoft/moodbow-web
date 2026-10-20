// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MOOD_HEX, THEMES } from "./moodbow";
import contract from "../../../content/contracts/year-card.json";
import { YEAR_MIN_MONTHS, yearBands, yearFileName, yearOnOffer, yearRange } from "./year";

const day = (month: number, d: number, mood: number) => ({ local_date: `2026-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`, mood });
const month = (m: number, moods: number[]) => moods.map((mood, i) => day(m, i + 1, mood));

describe("yearBands (decision 184)", () => {
  it("twelve bands, January innermost: each month's most frequent mood; under 5 check-ins, faint muted", () => {
    const rows = [...month(1, [4, 4, 4, 2, 5]), ...month(3, [1, 1, 2, 2, 3, 3, 1]), ...month(12, [5, 5])];
    const card = yearBands(rows, 2026, "light");
    expect(card.colours).toHaveLength(12);
    expect(card.colours[0]).toBe(MOOD_HEX[3]); // January: 4
    expect(card.colours[2]).toBe(MOOD_HEX[0]); // March: 1 (three times)
    expect(card.colours[1]).toBe(`${THEMES.light.muted}40`); // February: none
    expect(card.colours[11]).toBe(`${THEMES.light.muted}40`); // December: only 2
    expect(card.colouredMonths).toBe(2);
    expect(card.days).toBe(14);
  });

  it("a tie goes to the higher mood; the theme's own muted colour", () => {
    const card = yearBands(month(5, [2, 2, 4, 4, 3]), 2026, "dark");
    expect(card.colours[4]).toBe(MOOD_HEX[3]);
    expect(card.colours[0]).toBe(`${THEMES.dark.muted}40`);
  });

  it("only that year's rows count", () => {
    const card = yearBands([...month(6, [3, 3, 3, 3, 3]), { local_date: "2025-06-01", mood: 5 }], 2026, "light");
    expect(card.days).toBe(5);
    expect(card.colouredMonths).toBe(1);
  });
});

describe("yearOnOffer: December this year, January last year", () => {
  it.each([
    ["2026-12-01", 2026],
    ["2026-12-31", 2026],
    ["2027-01-15", 2026],
    ["2026-11-30", null],
    ["2026-02-01", null],
  ])("%s → %s", (today, year) => {
    expect(yearOnOffer(today)).toBe(year);
  });
});

it("the file and the range", () => {
  expect(yearFileName(2026)).toBe("moodbow-2026.png");
  expect(yearRange(2026)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
});

// The shared contract (moodbow-app supabase/contracts/year-card.json): the
// app runs the same cases. Bands as moods 1–5, null for a faint month.
describe("the year-card.json contract (v1)", () => {
  it.each(contract.cases)("$name", ({ today, checkIns, expect: want }) => {
    const year = yearOnOffer(today);
    expect(year).toBe(want.year);
    if (year === null) return;
    const card = yearBands(
      checkIns.map((c) => ({ local_date: c.date, mood: c.mood })),
      year,
      "light",
    );
    expect(card.colours.map((hex) => (MOOD_HEX.indexOf(hex) >= 0 ? MOOD_HEX.indexOf(hex) + 1 : null))).toEqual(want.moods);
    expect(card.days).toBe(want.days);
    expect(card.colouredMonths >= YEAR_MIN_MONTHS).toBe(want.offered);
  });
});
