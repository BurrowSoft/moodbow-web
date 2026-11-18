import { roundFor, type InsightRow } from "./insights";
import { PATTERN_IDS, PATTERN_SIDE, patternSide, type PatternId } from "./patterns";
import { isHard } from "./yourWeek";
import { yearOnOffer } from "../share/year";
import { MIN_CHECK_INS } from "../share/moodbow";
import { flagsCrisis, type CrisisKeywords } from "../safety/crisis";

// Your year in Moodbow (1.4 A, specs/1.4-features.md, UX rulings 18 Nov): a few swipeable screens
// that say the person's year back to them, from fixed rules, no AI, nothing new stored. Check-in
// values, the moment flag and dates, their own Things that help me and tags only; never entry text.
// The rules, with worked cases for the app to run the same ones: content/contracts/year-review.json.
// - the year: December → this year; January → the year just ended; otherwise the most recent
//   complete year with 30 days (last year when none has);
// - a day counts if its check-in has a mood 1-5; under 30 such days: "not enough";
// - hard (Your week's v2 rule, exactly): low on more than half, or no good day at all and low on
//   at least half. Then the moments, helped and pattern screens are replaced by one kind line
//   with the help offer, and there is no pattern sentence;
// - colours: each month's most frequent mood, ties to the higher; under 5 check-ins: faint (null),
//   the same months as the Year card (share/year.ts) that the share image draws;
// - moments: the count, and the dates of the first, middle and last moment of the year (date
//   order, two on a day by id; the middle of n is number floor((n-1)/2) from 0); all of them
//   under 4. No screen at 0;
// - helped: up to 3 Things that help me in the person's own order (titled "Things that help you",
//   never "most used": nothing records use), and, only while tags are on, the 3 tags on the most
//   good days (mood 4-5), each on 3 good days at least; ties by the lowercased tag in code-point
//   order; shown as most recently typed. No screen when both are empty;
// - pattern: Patterns' sides over the year (5 days each at least), the gap from the rounded
//   averages at least 1.0, in the expected direction only, the largest gap; ties in Patterns'
//   order. No screen without one;
// - colours, days and the closing line always.
export const YEAR_REVIEW_RULES = {
  minDays: 30,
  maxMoments: 3,
  maxHelps: 3,
  maxTags: 3,
  minTagDays: 3,
  goodMoods: [4, 5],
  minPerSide: 5,
  minGap: 1,
} as const;

export type YearMoment = { id: string; entry_date: string };
export type YearTag = { local_date: string; tag: string; created_at?: string };
export type YearHelp = { text: string; position: number };

export type YearScreen =
  | { screen: "colours"; months: (number | null)[] }
  | { screen: "days"; days: number }
  | { screen: "moments"; count: number; dates: string[] }
  | { screen: "helped"; helps: string[]; tags: string[] }
  | { screen: "pattern"; template: "patternSleep" | "patternMovement" | "patternStress" }
  | { screen: "hard" }
  | { screen: "closing" };

export type YearReview =
  | { year: number; state: "notEnough"; days: number }
  | { year: number; state: "ready"; hard: boolean; days: number; screens: YearScreen[] };

export type YearReviewInput = {
  today: string;
  checkIns: InsightRow[];
  moments: YearMoment[];
  helps: YearHelp[];
  // null: tags are off (tags-live not met), so no tag is ever shown.
  tags: YearTag[] | null;
  // A tag the crisis matcher flags never shows or counts (as in More patterns by tag). Without
  // the keywords (null), no tag shows at all, never an unchecked one.
  keywords: CrisisKeywords | null;
};

const PATTERN_TEMPLATE = { sleep: "patternSleep", movement: "patternMovement", stress: "patternStress" } as const;

// The year shown: fixed in December and January; else the newest complete year with enough days
// (so earlier years' check-ins are read too), else last year.
export function reviewYear(today: string, rows: InsightRow[] = []): number {
  const fixed = yearOnOffer(today);
  if (fixed !== null) return fixed;
  const last = Number(today.slice(0, 4)) - 1;
  const years = [...new Set(rows.map((r) => Number(r.local_date?.slice(0, 4))))].filter((y) => Number.isInteger(y) && y <= last).sort((a, b) => b - a);
  return years.find((y) => yearRows(rows, y).length >= YEAR_REVIEW_RULES.minDays) ?? last;
}
// The card on Today: 1 December to 31 January (the profile's date).
export const yearCardOnToday = (today: string): boolean => yearOnOffer(today) !== null;

const validMood = (m: unknown): m is number => typeof m === "number" && Number.isInteger(m) && m >= 1 && m <= 5;

// One row per day: the first row with a mood wins (check-ins are one a day; this only guards).
function yearRows(rows: InsightRow[], year: number): InsightRow[] {
  const prefix = `${year}-`;
  const seen = new Set<string>();
  const out: InsightRow[] = [];
  for (const r of rows) {
    if (!r.local_date?.startsWith(prefix) || !validMood(r.mood) || seen.has(r.local_date)) continue;
    seen.add(r.local_date);
    out.push(r);
  }
  return out;
}

export function monthMoods(rows: InsightRow[]): (number | null)[] {
  const counts = Array.from({ length: 12 }, () => [0, 0, 0, 0, 0]);
  for (const r of rows) counts[Number(r.local_date.slice(5, 7)) - 1][r.mood - 1]++;
  return counts.map((byMood) => {
    if (byMood.reduce((a, b) => a + b, 0) < MIN_CHECK_INS) return null;
    let best = 0;
    for (let m = 1; m < 5; m++) if (byMood[m] >= byMood[best]) best = m;
    return best + 1;
  });
}

function bestPattern(rows: InsightRow[]): PatternId | null {
  let best: { id: PatternId; gap: number } | null = null;
  for (const id of PATTERN_IDS) {
    const groups = { a: [] as number[], b: [] as number[] };
    for (const row of rows) {
      const s = PATTERN_SIDE[id](row);
      if (s) groups[s].push(row.mood);
    }
    if (groups.a.length < YEAR_REVIEW_RULES.minPerSide || groups.b.length < YEAR_REVIEW_RULES.minPerSide) continue;
    const gap = roundFor("mood", patternSide(groups.a).mood - patternSide(groups.b).mood);
    if (gap >= YEAR_REVIEW_RULES.minGap && (!best || gap > best.gap)) best = { id, gap };
  }
  return best?.id ?? null;
}

export const firstMiddleLast = <T,>(sorted: T[]): T[] =>
  sorted.length <= YEAR_REVIEW_RULES.maxMoments ? sorted : [sorted[0], sorted[Math.floor((sorted.length - 1) / 2)], sorted[sorted.length - 1]];

function topTags(tags: YearTag[], goodDays: Set<string>): string[] {
  const byKey = new Map<string, { days: Set<string>; shown: string; at: string }>();
  for (const t of tags) {
    if (!goodDays.has(t.local_date) || typeof t.tag !== "string" || t.tag.trim() === "") continue;
    const key = t.tag.toLowerCase();
    const at = `${t.local_date} ${t.created_at ?? ""}`;
    const g = byKey.get(key) ?? { days: new Set<string>(), shown: t.tag, at };
    g.days.add(t.local_date);
    if (at >= g.at) {
      g.shown = t.tag;
      g.at = at;
    }
    byKey.set(key, g);
  }
  return [...byKey.entries()]
    .filter(([, g]) => g.days.size >= YEAR_REVIEW_RULES.minTagDays)
    .sort(([ka, a], [kb, b]) => b.days.size - a.days.size || (ka < kb ? -1 : ka > kb ? 1 : 0))
    .slice(0, YEAR_REVIEW_RULES.maxTags)
    .map(([, g]) => g.shown);
}

export function yearReview(input: YearReviewInput): YearReview {
  const year = reviewYear(input.today, input.checkIns);
  const rows = yearRows(input.checkIns, year);
  const days = rows.length;
  if (days < YEAR_REVIEW_RULES.minDays) return { year, state: "notEnough", days };

  const hard = isHard(rows);
  const screens: YearScreen[] = [
    { screen: "colours", months: monthMoods(rows) },
    { screen: "days", days },
  ];
  if (hard) {
    screens.push({ screen: "hard" });
  } else {
    const prefix = `${year}-`;
    const moments = input.moments
      .filter((m) => m.entry_date?.startsWith(prefix))
      .sort((x, y) => (x.entry_date === y.entry_date ? (x.id < y.id ? -1 : x.id > y.id ? 1 : 0) : x.entry_date < y.entry_date ? -1 : 1));
    if (moments.length > 0) screens.push({ screen: "moments", count: moments.length, dates: firstMiddleLast(moments).map((m) => m.entry_date) });

    const helps = [...input.helps]
      .filter((h) => typeof h.text === "string" && h.text.trim() !== "")
      .sort((a, b) => a.position - b.position)
      .slice(0, YEAR_REVIEW_RULES.maxHelps)
      .map((h) => h.text);
    const goodDays = new Set(rows.filter((r) => (YEAR_REVIEW_RULES.goodMoods as readonly number[]).includes(r.mood)).map((r) => r.local_date));
    const keywords = input.keywords;
    const tags = input.tags && keywords ? topTags(input.tags.filter((t) => !flagsCrisis(t.tag ?? "", keywords)), goodDays) : [];
    if (helps.length > 0 || tags.length > 0) screens.push({ screen: "helped", helps, tags });

    const pattern = bestPattern(rows);
    if (pattern) screens.push({ screen: "pattern", template: PATTERN_TEMPLATE[pattern] });
  }
  screens.push({ screen: "closing" });
  return { year, state: "ready", hard, days, screens };
}
