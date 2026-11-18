// Days you showed up (1.4 C, specs/1.4-features.md; UX 18 Nov): how many days had a check-in in a
// window, said kindly. Never a streak, a chain, a gap or a "don't break it": only a count. The
// rules are the app's, in showedUp.contract.json (moodbow-app supabase/contracts/showed-up.json,
// PR #252 at f1d2a8d2; it moves to content/contracts with a SOURCE.json pin once that's on master):
// - a day is a check-in with a mood 1-5, one per date (the profile's local dates);
// - windows end today, and later rows are ignored;
// - week = today-6..today, month = today-29..today, threeMonths = today-89..today (Insights' tabs);
// - year = the 1st of the month 11 months back..today (Plus's Year: 12 calendar months, this one
//   included); all = every day up to today (Plus's All time);
// - 0 days: the line is hidden, never "0 days" (UX, 18 Nov).
export const SHOWED_UP_RANGES = ["week", "month", "threeMonths", "year", "all"] as const;
export type ShowedUpRange = (typeof SHOWED_UP_RANGES)[number];
export type ShowedUp = Record<ShowedUpRange, number>;

type Row = { local_date: string; mood: number | null | undefined };

const minusDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

// The 1st of the month 11 months before today's month.
export function yearWindowStart(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1 - 11;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

export function windowStart(range: ShowedUpRange, today: string): string | null {
  switch (range) {
    case "week":
      return minusDays(today, 6);
    case "month":
      return minusDays(today, 29);
    case "threeMonths":
      return minusDays(today, 89);
    case "year":
      return yearWindowStart(today);
    case "all":
      return null;
  }
}

const isMood = (m: unknown): m is number => typeof m === "number" && Number.isInteger(m) && m >= 1 && m <= 5;

export function showedUp(rows: readonly Row[], today: string): ShowedUp {
  const days = [...new Set(rows.filter((r) => typeof r.local_date === "string" && r.local_date <= today && isMood(r.mood)).map((r) => r.local_date))];
  const out = {} as ShowedUp;
  for (const range of SHOWED_UP_RANGES) {
    const start = windowStart(range, today);
    out[range] = start === null ? days.length : days.filter((d) => d >= start).length;
  }
  return out;
}

// What the line shows: the count, or "hidden" at 0 (the contract's expect values).
export type ShowedUpShown = Record<ShowedUpRange, number | "hidden">;
export function showedUpShown(rows: readonly Row[], today: string): ShowedUpShown {
  const counts = showedUp(rows, today);
  const out = {} as ShowedUpShown;
  for (const range of SHOWED_UP_RANGES) out[range] = counts[range] === 0 ? "hidden" : counts[range];
  return out;
}

// Insights' tab names, as the copy's select names them (ICU select keys can't start with a digit).
export const INSIGHTS_TAB_RANGE = { week: "week", month: "month", "3months": "threeMonths", year: "year", all: "all" } as const satisfies Record<string, ShowedUpRange>;
