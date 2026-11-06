import { rangeDays, roundFor, type InsightRow } from "./insights";

// Patterns in Insights (no AI; UX 2026-11-04): the person's own check-ins
// side by side, mood on the same check-in split by one factor. The rules
// are the app's, in content/contracts/patterns.json (patterns.test runs
// every case and pins these numbers to its "rules"):
// - a fixed 90 days, today − 89 … today, on every Insights tab; rows after
//   today are ignored;
// - fewer than 14 check-ins (rows with a mood) in the window → nothing;
// - pairs in this fixed order: sleep (7 h or more / less), movement (some /
//   none; null is left out), stress (1–2 / 4–5; 3 is left out);
// - each side needs 5 days, else "not_enough" (hidden);
// - each side's average mood to one decimal (halves away from zero), and
//   the gap from those rounded numbers: 0.5 or more "shown", else "same".
export const PATTERN_RULES = {
  windowDays: 90,
  minPerSide: 5,
  minCheckIns: 14,
  sameBelow: 0.5,
  sleepHoursAtLeast: 7,
  stressLow: [1, 2],
  stressHigh: [4, 5],
} as const;

export type PatternId = "sleep" | "movement" | "stress";
export const PATTERN_IDS: PatternId[] = ["sleep", "movement", "stress"];
export type PatternSide = { days: number; mood: number };
export type Pattern =
  | { id: PatternId; state: "shown" | "same"; a: PatternSide; b: PatternSide; diff: number }
  | { id: PatternId; state: "not_enough"; a: null; b: null; diff: null };

const asNumber = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));

// Which side of a pattern a check-in is on, or null (left out).
const SIDE: Record<PatternId, (row: InsightRow) => "a" | "b" | null> = {
  sleep: (row) => {
    const h = asNumber(row.sleep_hours);
    return h === null || Number.isNaN(h) ? null : h >= PATTERN_RULES.sleepHoursAtLeast ? "a" : "b";
  },
  movement: (row) => (row.exercise_minutes === null || row.exercise_minutes === undefined ? null : row.exercise_minutes > 0 ? "a" : "b"),
  stress: (row) => {
    const s = row.stress;
    if (s === null || s === undefined) return null;
    return (PATTERN_RULES.stressLow as readonly number[]).includes(s) ? "a" : (PATTERN_RULES.stressHigh as readonly number[]).includes(s) ? "b" : null;
  },
};

const notEnough = (id: PatternId): Pattern => ({ id, state: "not_enough", a: null, b: null, diff: null });
// Sum then divide (no running mean), then round: the same steps as the app.
const side = (moods: number[]): PatternSide => ({ days: moods.length, mood: roundFor("mood", moods.reduce((s, m) => s + m, 0) / moods.length) });
// Your week splits a week's check-ins the same way.
export { SIDE as PATTERN_SIDE, side as patternSide };

export function patterns(rows: InsightRow[], today: string): Pattern[] {
  const window = new Set(rangeDays(today, "3months"));
  const inWindow = rows.filter((r) => window.has(r.local_date) && r.mood !== null && r.mood !== undefined);
  if (inWindow.length < PATTERN_RULES.minCheckIns) return PATTERN_IDS.map(notEnough);
  return PATTERN_IDS.map((id) => {
    const groups = { a: [] as number[], b: [] as number[] };
    for (const row of inWindow) {
      const s = SIDE[id](row);
      if (s) groups[s].push(row.mood);
    }
    if (groups.a.length < PATTERN_RULES.minPerSide || groups.b.length < PATTERN_RULES.minPerSide) return notEnough(id);
    const a = side(groups.a);
    const b = side(groups.b);
    const diff = roundFor("mood", a.mood - b.mood);
    return { id, state: Math.abs(diff) >= PATTERN_RULES.sameBelow ? "shown" : "same", a, b, diff };
  });
}

// The first day the Insights page must load so the patterns have their
// whole window (the charts' own range may be shorter: Week, Month).
export const patternsWindowStart = (today: string) => rangeDays(today, "3months")[0];
