import { roundFor, value, type InsightRow, type Metric } from "@/lib/journal/insights";
import { PATTERN_RULES } from "@/lib/journal/patterns";
import { LONG_RULES } from "./longRange";

// Moodbow Plus: Year in review (decision 246; UX's copy, 11 Nov). One calendar
// year from existing data only: check-in days per month (no streaks), mood by
// month (a month counts with 5 check-ins, as Year), sleep, movement and stress
// over the year (shown with 14 or more values, the patterns' minimum), how many
// entries and moments, and the moments by date. No scores, no best or worst.

export type ReviewMoment = { id: string; date: string; opening: string };
export type YearReview = {
  daysByMonth: number[];
  days: number;
  moodByMonth: (number | null)[];
  moodEnough: boolean;
  factors: { sleep: number | null; movement: number | null; stress: number | null };
  entries: number;
  moments: ReviewMoment[];
};

export const OPENING_CHARS = 80;
// The first words of an entry, up to about 80 characters, cut at a word.
export function opening(body: string, max = OPENING_CHARS): string {
  const text = body.replace(/\s+/g, " ").trim();
  if ([...text].length <= max) return text;
  const cut = [...text].slice(0, max).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const mean = (vs: number[]) => vs.reduce((s, v) => s + v, 0) / vs.length;
const factor = (rows: InsightRow[], metric: Metric) => {
  const vs = rows.map((r) => value(r, metric)).filter((v): v is number => v !== null && !Number.isNaN(v));
  return vs.length >= PATTERN_RULES.minCheckIns ? roundFor(metric, mean(vs)) : null;
};

export function yearReview(
  year: string,
  rows: InsightRow[],
  entries: number,
  moments: { id: string; entry_date: string; body: string }[],
): YearReview {
  const inYear = rows.filter((r) => r.local_date.startsWith(`${year}-`) && r.mood !== null && r.mood !== undefined);
  const byMonth = Array.from({ length: 12 }, (_, i) => inYear.filter((r) => Number(r.local_date.slice(5, 7)) === i + 1));
  const moodByMonth = byMonth.map((rs) => (rs.length >= LONG_RULES.monthMin ? roundFor("mood", mean(rs.map((r) => r.mood))) : null));
  return {
    daysByMonth: byMonth.map((rs) => new Set(rs.map((r) => r.local_date)).size),
    days: new Set(inYear.map((r) => r.local_date)).size,
    moodByMonth,
    moodEnough: moodByMonth.filter((v) => v !== null).length >= LONG_RULES.minPeriods,
    factors: { sleep: factor(inYear, "sleep"), movement: factor(inYear, "exercise"), stress: factor(inYear, "stress") },
    entries,
    moments: moments
      .filter((e) => e.entry_date.startsWith(`${year}-`) && e.body.trim())
      .sort((a, b) => (a.entry_date === b.entry_date ? a.id.localeCompare(b.id) : a.entry_date < b.entry_date ? -1 : 1))
      .map((e) => ({ id: e.id, date: e.entry_date, opening: opening(e.body) })),
  };
}

export const isReviewYear = (s: unknown, today: string): s is string => typeof s === "string" && /^\d{4}$/.test(s) && s <= today.slice(0, 4);
