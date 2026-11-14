import { describe, expect, it } from "vitest";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import type { InsightRow } from "@/lib/journal/insights";
import { TAG_PATTERNS_MAX, tagPatterns, tagsByDayFrom } from "./tagPatterns";

const TODAY = "2026-11-12";
const day = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const row = (n: number, mood: number): InsightRow => ({ local_date: day(n), mood, sleep_hours: null, stress: null, exercise_minutes: null });
// 20 check-ins: the first `tagged` days carry the tag(s), at moodA; the rest at moodB.
function setup(tags: Record<string, number[]>, moods: (n: number) => number = () => 3, count = 20) {
  const rows = Array.from({ length: count }, (_, n) => row(n, moods(n)));
  const tagRows = Object.entries(tags).flatMap(([tag, days]) => days.map((n) => ({ local_date: day(n), tag })));
  return { rows, byDay: tagsByDayFrom(tagRows) };
}
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

describe("More patterns by tag (UX, 12 Nov)", () => {
  it("today's rules: a 0.5 gap is shown, less is 'about the same'", () => {
    const { rows, byDay } = setup({ walk: range(0, 8), work: range(0, 8) }, (n) => (n < 8 ? 4 : 3.5));
    const out = tagPatterns(rows, TODAY, "year", byDay, CRISIS_KEYWORDS);
    expect(out.find((p) => p.tag === "walk")).toMatchObject({ state: "shown", a: { days: 8, mood: 4 }, b: { days: 12, mood: 3.5 } });
    const same = setup({ walk: range(0, 8) }, (n) => (n < 8 ? 3.4 : 3));
    expect(tagPatterns(same.rows, TODAY, "year", same.byDay, CRISIS_KEYWORDS)[0]).toMatchObject({ state: "same" });
  });

  it("not enough: under 14 check-ins nothing; under 5 days on a side, that tag is left out", () => {
    const few = setup({ walk: range(0, 6) }, () => 3, 13);
    expect(tagPatterns(few.rows, TODAY, "year", few.byDay, CRISIS_KEYWORDS)).toEqual([]);
    const oneSide = setup({ rare: range(0, 4), often: range(0, 17) });
    expect(tagPatterns(oneSide.rows, TODAY, "year", oneSide.byDay, CRISIS_KEYWORDS).map((p) => p.tag)).toEqual([]);
    const ok = setup({ rare: range(0, 4), mid: range(0, 6) });
    expect(tagPatterns(ok.rows, TODAY, "year", ok.byDay, CRISIS_KEYWORDS).map((p) => p.tag)).toEqual(["mid"]);
  });

  it("at most 5, by how many days carry them (ties alphabetical), never by the size of the gap", () => {
    const tags = { a: range(0, 10), b: range(0, 9), c: range(0, 8), d: range(0, 7), e: range(0, 6), f: range(0, 6), g: range(0, 5) };
    // The rarest tag has the biggest gap: it still doesn't jump the order.
    const { rows, byDay } = setup(tags, (n) => (n < 5 ? 5 : 2));
    const out = tagPatterns(rows, TODAY, "year", byDay, CRISIS_KEYWORDS);
    expect(out).toHaveLength(TAG_PATTERNS_MAX);
    expect(out.map((p) => p.tag)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("a tag the crisis matcher flags never appears, and doesn't take a place", () => {
    const phrase = CRISIS_KEYWORDS!.languages.en.phrases[0];
    const { rows, byDay } = setup({ [phrase]: range(0, 12), walk: range(0, 8) });
    const out = tagPatterns(rows, TODAY, "year", byDay, CRISIS_KEYWORDS);
    expect(out.map((p) => p.tag)).toEqual(["walk"]);
  });

  it("the period: the last 12 months, or all time", () => {
    // 20 check-ins over 400 days: a year leaves out the oldest.
    const rows = Array.from({ length: 20 }, (_, n) => row(n * 20, n < 10 ? 4 : 3));
    const byDay = tagsByDayFrom(range(0, 10).map((n) => ({ local_date: day(n * 20), tag: "walk" })));
    expect(tagPatterns(rows, TODAY, "year", byDay, CRISIS_KEYWORDS)[0]).toMatchObject({ a: { days: 10 }, b: { days: 9 } });
    expect(tagPatterns(rows, TODAY, "all", byDay, CRISIS_KEYWORDS)[0]).toMatchObject({ a: { days: 10 }, b: { days: 10 } });
  });

  it("one tag whatever its case, shown with its latest spelling (as my_recent_tags)", () => {
    const { rows } = setup({});
    const tagRows = [
      ...range(0, 3).map((n) => ({ local_date: day(n + 3), tag: "work", created_at: `${day(n + 3)}T09:00:00Z` })),
      ...range(0, 3).map((n) => ({ local_date: day(n), tag: "Work", created_at: `${day(n)}T09:00:00Z` })),
    ];
    const out = tagPatterns(rows, TODAY, "year", tagsByDayFrom(tagRows), CRISIS_KEYWORDS);
    // 3 + 3 days: one tag with 6, which clears the 5 a side that neither spelling alone would.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ tag: "Work", a: { days: 6 } });
    // The latest spelling wins whichever order the rows come in.
    const reversed = tagPatterns(rows, TODAY, "year", tagsByDayFrom([...tagRows].reverse()), CRISIS_KEYWORDS);
    expect(reversed[0].tag).toBe("Work");
  });

  it("a day's tag counted once, even if it came twice", () => {
    const { rows } = setup({});
    const byDay = tagsByDayFrom([...range(0, 6), 0].map((n) => ({ local_date: day(n), tag: "walk" })));
    expect(tagPatterns(rows, TODAY, "year", byDay, CRISIS_KEYWORDS)[0]).toMatchObject({ tag: "walk", a: { days: 6 } });
  });
});
