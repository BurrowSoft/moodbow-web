import { roundFor, type InsightRow } from "./insights";
import { PATTERN_IDS, PATTERN_SIDE, patternSide, type PatternId } from "./patterns";
import { lastWeekStart } from "./report";

// Your week (specs/your-week.md; UX 2026-11-06): a small card at the top of
// Insights that says something back about the person's week, from fixed rules,
// no AI. Check-in values and the star only, never entry text. The rules are in
// content/contracts/your-week.json (synced from the app repo) with worked cases, which both run:
// - the last complete Monday to Sunday; a check-in counts if it has a mood;
// - under 4 check-ins: no card;
// - mood 1 or 2 on more than half: only "hard", nothing else;
// - otherwise at most 2 lines. First a pattern, else how the week looked. Then
//   the moment, else how the week looked if the first line was a pattern;
// - no lines, no card;
// - a pattern's sides are Patterns': 2 days each at least, the gap from the
//   rounded averages at least 1.0, in the expected direction only (the other way
//   would read as advice); the largest gap wins, ties in Patterns' order.
export const YOUR_WEEK_RULES = {
  minCheckIns: 4,
  lowMoods: [1, 2],
  goodMoods: [4, 5],
  steadyMood: 3,
  minPerSide: 2,
  minGap: 1,
  minGoodDays: 2,
} as const;

export type YourWeekMoment = { id: string; entry_date: string };
export type YourWeekLine =
  | { template: "patternSleep" | "patternMovement" | "patternStress" | "lookMoreGood" | "lookGoodNoLow" | "lookSteady" | "lookMixed" }
  | { template: "moment"; id: string; date: string };
export type YourWeek =
  | { start: string; end: string; kind: "hard" }
  // caption: Patterns' "go together, not cause" line, with a pattern only. Not one of the lines.
  | { start: string; end: string; kind: "lines"; lines: YourWeekLine[]; caption: boolean };

const PATTERN_TEMPLATE = { sleep: "patternSleep", movement: "patternMovement", stress: "patternStress" } as const;

export const sixDaysAfter = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
};

// The largest gap, or null. Patterns' order, and only a larger gap replaces, so a
// tie stays with the earlier one.
function bestPattern(rows: InsightRow[]): PatternId | null {
  let best: { id: PatternId; gap: number } | null = null;
  for (const id of PATTERN_IDS) {
    const groups = { a: [] as number[], b: [] as number[] };
    for (const row of rows) {
      const s = PATTERN_SIDE[id](row);
      if (s) groups[s].push(row.mood);
    }
    if (groups.a.length < YOUR_WEEK_RULES.minPerSide || groups.b.length < YOUR_WEEK_RULES.minPerSide) continue;
    const gap = roundFor("mood", patternSide(groups.a).mood - patternSide(groups.b).mood);
    if (gap >= YOUR_WEEK_RULES.minGap && (!best || gap > best.gap)) best = { id, gap };
  }
  return best?.id ?? null;
}

function howItLooked(rows: InsightRow[]): YourWeekLine | null {
  const count = (moods: readonly number[]) => rows.filter((r) => moods.includes(r.mood)).length;
  const good = count(YOUR_WEEK_RULES.goodMoods);
  const low = count(YOUR_WEEK_RULES.lowMoods);
  // Steady first (version 2, after Vitor's look): 4, 4, 3, 3, 3 is a steady week, not a good one.
  if (count([YOUR_WEEK_RULES.steadyMood]) * 2 > rows.length) return { template: "lookSteady" };
  // "More good days than low ones" read oddly with none low (v3, UX): 3, 3, 5, 5 says so.
  if (good > low && good >= YOUR_WEEK_RULES.minGoodDays) return { template: low === 0 ? "lookGoodNoLow" : "lookMoreGood" };
  if (good === low && good >= 1) return { template: "lookMixed" };
  return null;
}

export function yourWeek(allRows: InsightRow[], today: string, moments: YourWeekMoment[]): YourWeek | null {
  const start = lastWeekStart(today);
  const end = sixDaysAfter(start);
  const inWeek = (date: string) => date >= start && date <= end;
  const rows = allRows.filter((r) => inWeek(r.local_date) && r.mood !== null && r.mood !== undefined);
  if (rows.length < YOUR_WEEK_RULES.minCheckIns) return null;

  const low = rows.filter((r) => (YOUR_WEEK_RULES.lowMoods as readonly number[]).includes(r.mood)).length;
  if (low * 2 > rows.length) return { start, end, kind: "hard" };

  const pattern = bestPattern(rows);
  const look = howItLooked(rows);
  // The latest; two on one day: the larger id, so app and web pick the same.
  const moment = moments.filter((m) => inWeek(m.entry_date)).sort((x, y) => (x.entry_date === y.entry_date ? (x.id < y.id ? 1 : -1) : x.entry_date < y.entry_date ? 1 : -1))[0];

  const lines: YourWeekLine[] = [];
  if (pattern) lines.push({ template: PATTERN_TEMPLATE[pattern] });
  else if (look) lines.push(look);
  if (moment) lines.push({ template: "moment", id: moment.id, date: moment.entry_date });
  else if (pattern && look) lines.push(look);
  if (lines.length === 0) return null;
  return { start, end, kind: "lines", lines, caption: pattern !== null };
}
