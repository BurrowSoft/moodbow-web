// The Insights EXAMPLE a free user sees (spec "Insights become Plus", rulings 3 and 4): a static
// fixture in code. No network, no user id, no rows, no tags; no sample day framed as a crisis, and
// nothing about substances or eating. Four ranges, each with Mood, Sleep, Stress and Movement: an
// average, a change against the previous period, and one bar per day (week: 7, month: 30), per
// week (3 months: 13) or per month (year: 12).

export const EXAMPLE_RANGES = ["week", "month", "3months", "year"] as const;
export type ExampleRange = (typeof EXAMPLE_RANGES)[number];
export type ExampleMetric = "mood" | "sleep_hours" | "stress" | "exercise_minutes";
export type ExampleCard = { metric: ExampleMetric; average: number; change: number; bars: number[] };

const card = (metric: ExampleMetric, average: number, change: number, bars: number[]): ExampleCard => ({ metric, average, change, bars });

export const INSIGHTS_EXAMPLE: Record<ExampleRange, ExampleCard[]> = {
  week: [
    card("mood", 3.7, 0.3, [3, 4, 3, 4, 5, 4, 3]),
    card("sleep_hours", 7.2, 0.4, [7, 6.5, 7.5, 7, 8, 7.5, 7]),
    card("stress", 2.6, -0.2, [3, 3, 2, 3, 2, 2, 3]),
    card("exercise_minutes", 28, 6, [20, 0, 35, 30, 45, 25, 40]),
  ],
  month: [
    card("mood", 3.6, 0.2, [3, 4, 3, 4, 4, 3, 4, 4, 5, 4, 3, 3, 4, 4, 3, 4, 5, 4, 3, 4, 4, 3, 4, 3, 4, 4, 5, 3, 4, 4]),
    card("sleep_hours", 7.0, 0.2, [6.5, 7, 7, 6.5, 7.5, 7, 7, 7.5, 7, 7, 6.5, 7, 7.5, 7, 7, 6.5, 7, 7.5, 7, 7, 7, 6.5, 7, 7.5, 7, 7, 7, 6.5, 7, 7.5]),
    card("stress", 2.8, -0.1, [3, 3, 3, 2, 3, 3, 2, 3, 2, 3, 3, 3, 2, 3, 3, 2, 3, 3, 3, 2, 3, 3, 2, 3, 3, 3, 2, 3, 3, 2]),
    card("exercise_minutes", 25, 4, [20, 25, 15, 30, 25, 20, 35, 30, 25, 25, 0, 20, 30, 25, 40, 20, 25, 30, 15, 25, 35, 20, 25, 30, 20, 25, 30, 25, 20, 35]),
  ],
  "3months": [
    card("mood", 3.5, 0.3, [3, 3, 4, 3, 3, 4, 4, 3, 4, 4, 4, 3, 4]),
    card("sleep_hours", 6.9, 0.3, [6.5, 6.5, 7, 7, 6.5, 7, 7, 7, 7, 7.5, 7, 7, 7]),
    card("stress", 2.9, -0.3, [3, 3, 3, 3, 3, 3, 3, 2, 3, 3, 2, 3, 2]),
    card("exercise_minutes", 22, 5, [15, 20, 20, 25, 20, 20, 25, 25, 20, 30, 25, 25, 30]),
  ],
  year: [
    card("mood", 3.5, 0.2, [3, 3, 4, 3, 3, 4, 4, 4, 3, 4, 4, 4]),
    card("sleep_hours", 7.0, 0.1, [7, 6.5, 7, 7, 7, 7.5, 7.5, 7, 7, 7, 7, 7]),
    card("stress", 2.8, -0.2, [3, 3, 3, 3, 3, 2, 2, 3, 3, 3, 3, 2]),
    card("exercise_minutes", 24, 3, [20, 20, 25, 25, 30, 30, 35, 25, 20, 20, 20, 20]),
  ],
};
