import { roundFor, type InsightRow } from "@/lib/journal/insights";
import { PATTERN_RULES, patternSide, type PatternSide } from "@/lib/journal/patterns";
import { flagsCrisis, type CrisisKeywords } from "@/lib/safety/crisis";
import { moreWindowStart, type MoreWindow } from "./morePatterns";

// Moodbow Plus: More patterns by tag (UX, 12 Nov). For each tag the person uses, days tagged
// with it against the other days, over More patterns' period, by today's rules unchanged: 14
// check-ins with a mood in the period, 5 on each side, each side's average mood to one decimal,
// a gap of 0.5 or more "shown", else "same". Descriptive, never causal (the same footnote).
// At most 5 tags, those used on the most days (ties alphabetical), never chosen or ordered by
// the size of the gap. A tag the crisis matcher flags never appears here, nor counts.

export const TAG_PATTERNS_MAX = 5;
export type TagPattern = { tag: string; state: "shown" | "same"; a: PatternSide; b: PatternSide };

export function tagPatterns(rows: InsightRow[], today: string, window: MoreWindow, tagsByDay: ReadonlyMap<string, readonly string[]>, keywords: CrisisKeywords | null): TagPattern[] {
  const start = moreWindowStart(window, today);
  const inWindow = rows.filter((r) => r.local_date <= today && (start === null || r.local_date >= start) && r.mood !== null && r.mood !== undefined);
  if (inWindow.length < PATTERN_RULES.minCheckIns) return [];
  // How many of the period's checked-in days carry each tag.
  const days = new Map<string, number>();
  for (const row of inWindow) for (const tag of new Set(tagsByDay.get(row.local_date) ?? [])) days.set(tag, (days.get(tag) ?? 0) + 1);
  const candidates = [...days.entries()]
    .filter(([tag]) => !flagsCrisis(tag, keywords))
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([tag]) => tag);
  const out: TagPattern[] = [];
  for (const tag of candidates) {
    if (out.length === TAG_PATTERNS_MAX) break;
    const groups = { a: [] as number[], b: [] as number[] };
    for (const row of inWindow) groups[(tagsByDay.get(row.local_date) ?? []).includes(tag) ? "a" : "b"].push(row.mood);
    if (groups.a.length < PATTERN_RULES.minPerSide || groups.b.length < PATTERN_RULES.minPerSide) continue;
    const a = patternSide(groups.a);
    const b = patternSide(groups.b);
    // The gap from the rounded sides, rounded too, as More patterns does.
    out.push({ tag, state: Math.abs(roundFor("mood", a.mood - b.mood)) >= PATTERN_RULES.sameBelow ? "shown" : "same", a, b });
  }
  return out;
}

// The period's tags by day, from check_in_tags rows (the person's own, RLS).
export function tagsByDayFrom(rows: readonly { local_date: string; tag: string }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.local_date, [...(out.get(r.local_date) ?? []), r.tag]);
  return out;
}
