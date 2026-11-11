import { roundFor, value, type InsightRow, type Metric } from "@/lib/journal/insights";

// Moodbow Plus: Insights' Year and All time (decision 246; UX's copy, 11 Nov).
// The same charts as today's tabs, one point per month (or per quarter once
// all time spans more than 24 months): that period's average. A month counts
// with 5 or more check-ins with that value, a quarter with 15; otherwise it's a
// gap. A chart needs 2 counted periods. Year compares with the 12 months
// before, only when those have 2 counted months; All time has no change line.

export type LongRange = "year" | "all";
export const LONG_RANGES: LongRange[] = ["year", "all"];
export const isLongRange = (r: unknown): r is LongRange => r === "year" || r === "all";
export const LONG_RULES = { monthMin: 5, quarterMin: 15, monthsBeforeQuarters: 24, minPeriods: 2 } as const;

export type Unit = "month" | "quarter";
// A period: its first day (YYYY-MM-01) and the first day after it.
export type Period = { start: string; end: string };

const ym = (date: string) => ({ y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) });
const first = (y: number, m: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
const addMonths = (y: number, m: number, n: number) => {
  const t = y * 12 + (m - 1) + n;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
};
const monthsBetween = (a: { y: number; m: number }, b: { y: number; m: number }) => (b.y - a.y) * 12 + (b.m - a.m);

function months(from: { y: number; m: number }, count: number): Period[] {
  return Array.from({ length: count }, (_, i) => {
    const s = addMonths(from.y, from.m, i);
    const e = addMonths(from.y, from.m, i + 1);
    return { start: first(s.y, s.m), end: first(e.y, e.m) };
  });
}

// The periods a chart shows, oldest first, ending with today's month (or quarter).
export function periodsFor(range: LongRange, today: string, firstCheckIn: string | null): { unit: Unit; periods: Period[] } {
  const now = ym(today);
  if (range === "year") return { unit: "month", periods: months(addMonths(now.y, now.m, -11), 12) };
  const start = ym(firstCheckIn && firstCheckIn <= today ? firstCheckIn : today);
  const span = monthsBetween(start, now) + 1;
  if (span <= LONG_RULES.monthsBeforeQuarters) return { unit: "month", periods: months(start, span) };
  const q = (p: { y: number; m: number }) => ({ y: p.y, m: Math.floor((p.m - 1) / 3) * 3 + 1 });
  const qs = q(start);
  const count = Math.floor(monthsBetween(qs, q(now)) / 3) + 1;
  return {
    unit: "quarter",
    periods: Array.from({ length: count }, (_, i) => {
      const s = addMonths(qs.y, qs.m, i * 3);
      const e = addMonths(qs.y, qs.m, i * 3 + 3);
      return { start: first(s.y, s.m), end: first(e.y, e.m) };
    }),
  };
}

const valuesIn = (rows: InsightRow[], metric: Metric, from: string, to: string) =>
  rows.filter((r) => r.local_date >= from && r.local_date < to).map((r) => value(r, metric)).filter((v): v is number => v !== null && !Number.isNaN(v));
const mean = (vs: number[]) => vs.reduce((s, v) => s + v, 0) / vs.length;

export type LongSummary = { points: (number | null)[]; enough: boolean; average: number | null; change: number | null };

export function longSummary(rows: InsightRow[], today: string, range: LongRange, metric: Metric, firstCheckIn: string | null): LongSummary & { unit: Unit; periods: Period[] } {
  const { unit, periods } = periodsFor(range, today, firstCheckIn);
  const min = unit === "month" ? LONG_RULES.monthMin : LONG_RULES.quarterMin;
  const inPeriod = periods.map((p) => valuesIn(rows, metric, p.start, p.end));
  const points = inPeriod.map((vs) => (vs.length >= min ? roundFor(metric, mean(vs)) : null));
  const counted = inPeriod.filter((vs) => vs.length >= min);
  const enough = counted.length >= LONG_RULES.minPeriods;
  // The average over the counted periods' check-ins (a gap's few don't skew it).
  const average = enough ? roundFor(metric, mean(counted.flat())) : null;
  let change: number | null = null;
  if (range === "year" && average !== null) {
    const firstMonth = ym(periods[0].start);
    const before = months(addMonths(firstMonth.y, firstMonth.m, -12), 12).map((p) => valuesIn(rows, metric, p.start, p.end)).filter((vs) => vs.length >= LONG_RULES.monthMin);
    if (before.length >= LONG_RULES.minPeriods) change = roundFor(metric, average - roundFor(metric, mean(before.flat()))) + 0;
  }
  return { unit, periods, points, enough, average, change };
}

// What to read: Year needs its 12 months and the 12 before; All time, everything.
export function longRangeStart(range: LongRange, today: string): string | null {
  if (range === "all") return null;
  const now = ym(today);
  const s = addMonths(now.y, now.m, -23);
  return first(s.y, s.m);
}
