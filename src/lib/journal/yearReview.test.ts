import { describe, expect, it } from "vitest";
import contract from "./yearReview.contract.json";
import { cardMonths, firstMiddleLast, insightsRowYear, monthMoods, yearCardOnToday, yearReview, YEAR_REVIEW_RULES, type YearReviewInput } from "./yearReview";
import type { InsightRow } from "./insights";
import { yearBands } from "../share/year";
import { MOOD_HEX } from "../share/moodbow";
import { CRISIS_KEYWORDS } from "../safety/keywords";

type Tuple = [string, number, number | null, number | null, number | null];
const rowsOf = (tuples: Tuple[]): InsightRow[] =>
  tuples.map(([local_date, mood, sleep_hours, exercise_minutes, stress]) => ({ local_date, mood, sleep_hours, exercise_minutes, stress }));

const inputOf = (c: (typeof contract.cases)[number]): YearReviewInput => ({
  today: c.today,
  checkIns: rowsOf(c.checkIns as Tuple[]),
  moments: c.moments,
  helps: c.helps,
  tags: c.tags,
  keywords: CRISIS_KEYWORDS,
});

describe("year review contract (draft for moodbow-app)", () => {
  it("pins the rules", () => {
    expect(contract.rules).toEqual(YEAR_REVIEW_RULES);
  });

  for (const c of contract.cases) {
    it(c.name, () => {
      expect(yearReview(inputOf(c))).toEqual(c.expect);
      expect(insightsRowYear(c.today, rowsOf(c.checkIns as Tuple[]))).toBe(c.insightsRow);
    });
  }

  for (const t of contract.onToday) {
    it(`Today's card on ${t.today}: ${t.shows}`, () => expect(yearCardOnToday(t.today)).toBe(t.shows));
  }
});

describe("year review safety", () => {
  // Every week of moods from a year of 30-60 random check-ins: a hard year never shows moments,
  // helped or a pattern, and every year ends with the closing line.
  it("a hard year only ever has colours, days, the hard line and the closing", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    let hardSeen = 0;
    for (let i = 0; i < 400; i++) {
      const n = 30 + Math.floor(rand() * 30);
      const rows: InsightRow[] = Array.from({ length: n }, (_, k) => ({
        local_date: `2026-${String(1 + (k % 12)).padStart(2, "0")}-${String(1 + Math.floor(k / 12)).padStart(2, "0")}`,
        mood: 1 + Math.floor(rand() * 5),
        sleep_hours: rand() < 0.5 ? 8 : 5,
        exercise_minutes: rand() < 0.5 ? 30 : 0,
        stress: 1 + Math.floor(rand() * 5),
      }));
      const r = yearReview({ today: "2026-12-15", checkIns: rows, moments: [{ id: "a", entry_date: "2026-03-01" }], helps: [{ text: "x", position: 0 }], tags: [], keywords: CRISIS_KEYWORDS });
      if (r.state !== "ready") throw new Error("expected ready");
      expect(r.screens.at(-1)).toEqual({ screen: "closing" });
      if (r.hard) {
        hardSeen++;
        expect(r.screens.map((s) => s.screen)).toEqual(["colours", "days", "hard", "closing"]);
      } else {
        expect(r.screens.some((s) => s.screen === "hard")).toBe(false);
      }
    }
    expect(hardSeen).toBeGreaterThan(0);
  });

  it("never carries entry text: moments are dates only", () => {
    const r = yearReview(inputOf(contract.cases[0]));
    if (r.state !== "ready") throw new Error("expected ready");
    const moments = r.screens.find((s) => s.screen === "moments");
    expect(moments && Object.keys(moments).sort()).toEqual(["count", "dates", "screen"]);
  });

  it("tags off means no tag at all, even on good days", () => {
    const c = contract.cases[0];
    const r = yearReview({ ...inputOf(c), tags: null });
    if (r.state !== "ready") throw new Error("expected ready");
    expect(r.screens.find((s) => s.screen === "helped")).toEqual({ screen: "helped", helps: ["A walk", "Tea", "Music"], tags: [] });
  });
});

describe("year review tags and the crisis matcher", () => {
  const c = contract.cases[0];
  const phrase = CRISIS_KEYWORDS!.languages.en.phrases[0];
  const flagged = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"].map((local_date) => ({ local_date, tag: phrase }));

  it("a flagged tag never shows or counts, even on the most good days", () => {
    const r = yearReview({ ...inputOf(c), tags: [...c.tags!, ...flagged] });
    if (r.state !== "ready") throw new Error("expected ready");
    const helped = r.screens.find((s) => s.screen === "helped");
    expect(helped).toEqual({ screen: "helped", helps: ["A walk", "Tea", "Music"], tags: ["walk", "music", "art"] });
  });

  it("without the keywords, no tag shows at all", () => {
    const r = yearReview({ ...inputOf(c), keywords: null });
    if (r.state !== "ready") throw new Error("expected ready");
    expect(r.screens.find((s) => s.screen === "helped")).toEqual({ screen: "helped", helps: ["A walk", "Tea", "Music"], tags: [] });
  });
});

describe("year review details", () => {
  it("cardMonths is the Year card's own count; a month the card leaves faint can still have a colour here", () => {
    const c = contract.cases.find((x) => x.name.startsWith("I "))!;
    const rows = rowsOf(c.checkIns as Tuple[]);
    const card = yearBands(rows, 2026, "light");
    expect(cardMonths(rows)).toBe(card.colouredMonths);
    const moods = monthMoods(rows);
    moods.forEach((m, i) => {
      if (MOOD_HEX.includes(card.colours[i])) expect(card.colours[i]).toBe(MOOD_HEX[m! - 1]);
    });
    expect(moods[3]).toBe(2);
    expect(MOOD_HEX).not.toContain(card.colours[3]);
  });

  it("first, middle and last", () => {
    expect(firstMiddleLast([1, 2])).toEqual([1, 2]);
    expect(firstMiddleLast([1, 2, 3])).toEqual([1, 2, 3]);
    expect(firstMiddleLast([1, 2, 3, 4])).toEqual([1, 2, 4]);
    expect(firstMiddleLast([1, 2, 3, 4, 5, 6])).toEqual([1, 3, 6]);
  });
});
