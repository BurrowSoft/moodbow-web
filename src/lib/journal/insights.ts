// Insights (M6): four charts over a rolling range ending on the user's
// today (get_me().today), each with the range's average and the change vs
// the range just before it. Computed from the check-ins themselves; no AI.

export const RANGES = { week: 7, month: 30, "3months": 90 } as const;
export type Range = keyof typeof RANGES;
// Own keys only: `in` would also accept "toString", "__proto__"…
export const isRange = (s: unknown): s is Range => typeof s === "string" && Object.hasOwn(RANGES, s);

export type Metric = "mood" | "sleep" | "stress" | "exercise";
export const METRICS: Metric[] = ["mood", "sleep", "stress", "exercise"];

// Fewer points than this in the range: no chart, no average (chartNotEnough).
export const MIN_POINTS = 3;

export type InsightRow = { local_date: string; mood: number; sleep_hours: number | string | null; stress: number | null; exercise_minutes: number | null };

const DAY_MS = 86_400_000;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);

// The range's days, oldest first, ending on `today` (inclusive).
export function rangeDays(today: string, range: Range): string[] {
  const end = toTime(today);
  return Array.from({ length: RANGES[range] }, (_, i) => toDate(end - (RANGES[range] - 1 - i) * DAY_MS));
}

// The first day of the range before this one: what to load from.
export function previousRangeStart(today: string, range: Range): string {
  return toDate(toTime(today) - (2 * RANGES[range] - 1) * DAY_MS);
}

export function value(row: InsightRow, metric: Metric): number | null {
  const v = metric === "mood" ? row.mood : metric === "sleep" ? row.sleep_hours : metric === "stress" ? row.stress : row.exercise_minutes;
  return v === null || v === undefined ? null : Number(v);
}

// One slot per day of the range (null where nothing was logged).
export function series(rows: InsightRow[], days: string[], metric: Metric): (number | null)[] {
  const byDate = new Map(rows.map((r) => [r.local_date, r]));
  return days.map((d) => {
    const row = byDate.get(d);
    return row ? value(row, metric) : null;
  });
}

const mean = (values: (number | null)[]) => {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0) / present.length;
};

// Mood, stress and sleep hours to one decimal; exercise in whole minutes.
// Halves go AWAY FROM ZERO, like Dart's round() on the app (Math.round
// would turn −0.05 into −0, "Same as", where the app says "↓ 0.1"); −0
// becomes 0. Agreed with Mobile Dev, with shared test values.
const roundTo = (v: number, f: number) => Math.sign(v) * Math.round(Math.abs(v) * f) / f + 0;
export const roundFor = (metric: Metric, v: number) => roundTo(v, metric === "exercise" ? 1 : 10);

export type MetricSummary = {
  points: (number | null)[];
  enough: boolean;
  average: number | null;
  // This range's average minus the previous one's, rounded (0 = the same,
  // shown as chartNoChange); null when either range has too few points, and
  // then no change line at all (decision 98).
  change: number | null;
};

// Days without a value don't count (never as 0).
export function summarize(rows: InsightRow[], today: string, range: Range, metric: Metric): MetricSummary {
  const days = rangeDays(today, range);
  const before = rangeDays(toDate(toTime(days[0]) - DAY_MS), range);
  const points = series(rows, days, metric);
  const previous = series(rows, before, metric);
  const count = points.filter((v) => v !== null).length;
  const enough = count >= MIN_POINTS;
  const average = enough ? mean(points) : null;
  const previousAverage = previous.filter((v) => v !== null).length >= MIN_POINTS ? mean(previous) : null;
  let change: number | null = null;
  if (average !== null && previousAverage !== null) {
    // + 0 turns a -0 into 0.
    change = roundFor(metric, roundFor(metric, average) - roundFor(metric, previousAverage)) + 0;
  }
  return { points, enough, average: average === null ? null : roundFor(metric, average), change };
}
