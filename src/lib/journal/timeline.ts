import type { CheckIn } from "./checkIn";

// The Timeline (M5): one row per day with a check-in or an entry, newest
// first, from get_timeline (moodbow-app migration 002; previews only, never
// full bodies). Days with nothing logged don't exist, so there are no gaps.

export const TIMELINE_PAGE_DAYS = 30;

export type TimelineEntry = { id: string; preview: string; is_moment: boolean; created_at: string; updated_at: string };
export type TimelineDay = { local_date: string; check_in: CheckIn | null; entries: TimelineEntry[]; entry_count: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s: string) => ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().startsWith(s);

// Days grouped under their month ("2026-10"), keeping the order they came in.
export function groupByMonth<T extends { local_date: string }>(days: T[]): { month: string; days: T[] }[] {
  const groups: { month: string; days: T[] }[] = [];
  for (const day of days) {
    const month = day.local_date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.month === month) last.days.push(day);
    else groups.push({ month, days: [day] });
  }
  return groups;
}

// Labels in the user's regional format (decision 89), from Intl only.
const atNoon = (date: string) => new Date(`${date}T12:00:00Z`);
export const monthLabel = (month: string, dateLocaleTag: string) =>
  new Intl.DateTimeFormat(dateLocaleTag, { month: "long", year: "numeric", timeZone: "UTC" }).format(atNoon(`${month}-01`));
export const dayLabel = (date: string, dateLocaleTag: string) =>
  new Intl.DateTimeFormat(dateLocaleTag, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(atNoon(date));
