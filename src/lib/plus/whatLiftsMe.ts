import contract from "../../../content/what-lifts-me.json";
import { roundFor, type InsightRow } from "@/lib/journal/insights";
import { patternSide, type PatternSide } from "@/lib/journal/patterns";
import { flagsCrisis, type CrisisKeywords } from "@/lib/safety/crisis";
import { moreWindowStart, type MoreWindow } from "./morePatterns";

// Moodbow Plus: What lifts me, inside More patterns (1.3 part 2 and its rulings; the rules and the
// excluded words are content/what-lifts-me.json, shared with the app). Computed here, per request,
// from the person's own rows; nothing is stored, cached or logged.
export const LIFTS_RULES = contract.rules;
export type Lift = { tag: string; a: PatternSide; b: PatternSide; gap: number };

type Exclude = { prefixes?: string[]; words?: string[]; substrings?: string[] };
const EXCLUDE = contract.exclude as Record<string, Exclude>;
const COMBINING = /\p{M}/gu;
const fold = (s: string, stripMarks: boolean) => {
  const lower = s.normalize("NFKC").toLowerCase();
  return stripMarks ? lower.normalize("NFD").replace(COMBINING, "") : lower;
};

// The fixed substances and eating list, any language (the ruling): a word of the tag that starts
// with a prefix or is one of the words; Thai's substrings anywhere (marks kept: they're letters).
export function excludedTag(tag: string): boolean {
  const words = fold(tag, true).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const raw = fold(tag, false);
  for (const list of Object.values(EXCLUDE)) {
    if (list.substrings?.some((s) => raw.includes(fold(s, false)))) return true;
    const prefixes = (list.prefixes ?? []).map((p) => fold(p, true));
    const exact = new Set((list.words ?? []).map((w) => fold(w, true)));
    // A prefix of two words ("gueule de bois") matches the tag's words in a row.
    const joined = ` ${words.join(" ")}`;
    if (prefixes.some((p) => (p.includes(" ") ? joined.includes(` ${p}`) : words.some((w) => w.startsWith(p))))) return true;
    if (words.some((w) => exact.has(w))) return true;
  }
  return false;
}

// Each tag on at least minDaysWith checked-in days of the period, with minDaysWithout without it:
// the mood on each side (rounded, as More patterns), the gap a minus b (rounded). The largest
// gaps of minGap or more, positive only, at most max; ties by days used, then alphabetical.
// A tag the crisis matcher flags, or the list excludes, is never shown nor counted.
export function whatLiftsMe(rows: InsightRow[], today: string, window: MoreWindow, tagsByDay: ReadonlyMap<string, readonly string[]>, keywords: CrisisKeywords | null): Lift[] {
  const start = moreWindowStart(window, today);
  const inWindow = rows.filter((r) => r.local_date <= today && (start === null || r.local_date >= start) && r.mood !== null && r.mood !== undefined);
  const days = new Map<string, number>();
  for (const row of inWindow) for (const tag of new Set(tagsByDay.get(row.local_date) ?? [])) days.set(tag, (days.get(tag) ?? 0) + 1);
  const lifts: (Lift & { days: number })[] = [];
  for (const [tag, used] of days) {
    if (used < LIFTS_RULES.minDaysWith || flagsCrisis(tag, keywords) || excludedTag(tag)) continue;
    const groups = { a: [] as number[], b: [] as number[] };
    for (const row of inWindow) groups[(tagsByDay.get(row.local_date) ?? []).includes(tag) ? "a" : "b"].push(row.mood);
    if (groups.b.length < LIFTS_RULES.minDaysWithout) continue;
    const a = patternSide(groups.a);
    const b = patternSide(groups.b);
    const gap = roundFor("mood", a.mood - b.mood);
    if (gap >= LIFTS_RULES.minGap) lifts.push({ tag, a, b, gap, days: used });
  }
  return lifts
    // Names by plain code units, never the locale's collation, so the app orders them the same (UX 14 Nov).
    .sort((x, y) => y.gap - x.gap || y.days - x.days || (x.tag < y.tag ? -1 : x.tag > y.tag ? 1 : 0))
    .slice(0, LIFTS_RULES.max)
    .map(({ tag, a, b, gap }) => ({ tag, a, b, gap }));
}
