import { roundFor, type InsightRow } from "@/lib/journal/insights";
import { PATTERN_RULES, PATTERN_SIDE, patternSide, type PatternSide } from "@/lib/journal/patterns";

// Moodbow Plus: More patterns (decision 246; UX, 11 Nov: the first wave).
// Today's Patterns, over a longer period (the last 12 months, or since the
// first check-in), plus weekdays vs weekends and days you wrote vs days you
// didn't. Today's rules, unchanged: 14 check-ins with a mood in the period,
// 5 on each side, each side's average mood to one decimal, a gap of 0.5 or
// more "shown", else "same"; the fixed order, never sorted by size.
// Descriptive, never causal (the same footnote).

export type MorePatternId = "sleep" | "movement" | "stress" | "weekdays" | "writing";
export const MORE_PATTERN_IDS: MorePatternId[] = ["sleep", "movement", "stress", "weekdays", "writing"];
export type MorePattern =
  | { id: MorePatternId; state: "shown" | "same"; a: PatternSide; b: PatternSide }
  | { id: MorePatternId; state: "not_enough"; a: null; b: null };
export type MoreWindow = "year" | "all";

// Saturday and Sunday are the weekend (the date's own weekday, no time zone).
const weekend = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
};

// The first day of the last 12 months (today and the 364 days before), or null: everything.
export function moreWindowStart(window: MoreWindow, today: string): string | null {
  if (window === "all") return null;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 364);
  return d.toISOString().slice(0, 10);
}

export function morePatterns(rows: InsightRow[], today: string, window: MoreWindow, writtenDays: ReadonlySet<string>): MorePattern[] {
  const start = moreWindowStart(window, today);
  const inWindow = rows.filter((r) => r.local_date <= today && (start === null || r.local_date >= start) && r.mood !== null && r.mood !== undefined);
  const notEnough = (id: MorePatternId): MorePattern => ({ id, state: "not_enough", a: null, b: null });
  if (inWindow.length < PATTERN_RULES.minCheckIns) return MORE_PATTERN_IDS.map(notEnough);
  const sideOf: Record<MorePatternId, (row: InsightRow) => "a" | "b" | null> = {
    sleep: PATTERN_SIDE.sleep,
    movement: PATTERN_SIDE.movement,
    stress: PATTERN_SIDE.stress,
    weekdays: (row) => (weekend(row.local_date) ? "b" : "a"),
    writing: (row) => (writtenDays.has(row.local_date) ? "a" : "b"),
  };
  return MORE_PATTERN_IDS.map((id) => {
    const groups = { a: [] as number[], b: [] as number[] };
    for (const row of inWindow) {
      const s = sideOf[id](row);
      if (s) groups[s].push(row.mood);
    }
    if (groups.a.length < PATTERN_RULES.minPerSide || groups.b.length < PATTERN_RULES.minPerSide) return notEnough(id);
    const a = patternSide(groups.a);
    const b = patternSide(groups.b);
    // The gap from the rounded sides, rounded too: today's step (4.1 − 3.6 is 0.5, never 0.4999…).
    return { id, state: Math.abs(roundFor("mood", a.mood - b.mood)) >= PATTERN_RULES.sameBelow ? "shown" : "same", a, b };
  });
}
