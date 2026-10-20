// Month calendar (1.1 M, decision 197): the grid's dates and months, from
// plain YYYY-MM-DD strings at noon UTC (no time zone drift; the profile's
// today decides what's in the future).

// The week starts on Monday, as Insights' weeks do (the profile has no
// week-start setting yet).
export const WEEK_START = 1;

export type CalendarDay = { mood: number | null; moment: boolean; entry: boolean };
export type CalendarMonth = Record<string, CalendarDay>;

const atNoon = (date: string) => new Date(`${date}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const monthOf = (date: string) => date.slice(0, 7);

// "2026-10" → "2026-09" / "2026-11".
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  return iso(d).slice(0, 7);
}

// The month's weeks, each 7 cells: a date, or null before the 1st and after
// the last day.
export function monthGrid(month: string, weekStart = WEEK_START): (string | null)[][] {
  const first = atNoon(`${month}-01`);
  const lead = (first.getUTCDay() - weekStart + 7) % 7;
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

// A date n days away ("2026-10-31" + 1 → "2026-11-01").
export function addDays(date: string, n: number): string {
  const d = atNoon(date);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

// The weekday headers in order from the week start: the narrow initial to
// show and the full name for screen readers.
export function weekdayNames(dateLocaleTag: string, weekStart = WEEK_START): { short: string; long: string }[] {
  const narrow = new Intl.DateTimeFormat(dateLocaleTag, { weekday: "narrow", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat(dateLocaleTag, { weekday: "long", timeZone: "UTC" });
  // 2026-10-04 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => {
    const d = atNoon(addDays("2026-10-04", (weekStart + i) % 7));
    return { short: narrow.format(d), long: long.format(d) };
  });
}

// A day cell's date for its accessible name ("Tuesday 21 October").
export const calendarDate = (date: string, dateLocaleTag: string) =>
  new Intl.DateTimeFormat(dateLocaleTag, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(atNoon(date));

// The date number in the cell, in the region's digits.
export const dayNumber = (date: string, dateLocaleTag: string) => new Intl.DateTimeFormat(dateLocaleTag, { day: "numeric", timeZone: "UTC" }).format(atNoon(date));

// Rows → the month's days: the check-in's mood, whether there's a moment,
// whether there's an entry. Days with nothing are simply absent.
export function calendarMonth(checkIns: { local_date: string; mood: number }[], entries: { entry_date: string; is_moment: boolean }[]): CalendarMonth {
  const days: CalendarMonth = {};
  const day = (date: string) => (days[date] ??= { mood: null, moment: false, entry: false });
  for (const c of checkIns) if (c.mood >= 1 && c.mood <= 5) day(c.local_date).mood = c.mood;
  for (const e of entries) {
    const d = day(e.entry_date);
    d.entry = true;
    if (e.is_moment) d.moment = true;
  }
  return days;
}
