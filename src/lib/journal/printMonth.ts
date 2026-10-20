import type { CheckIn } from "./checkIn";

// Print a month (1.1 N, decision 199): the user's own words and check-ins
// for one month, oldest first, only the days with anything. No AI text.

export type PrintCheckIn = Pick<CheckIn, "local_date" | "mood" | "sleep_hours" | "exercise_minutes" | "stress">;
export type PrintEntryRow = { id: string; entry_date: string; body: string; is_moment: boolean; created_at: string };
export type PrintDay = { date: string; checkIn: PrintCheckIn | null; entries: { id: string; body: string; isMoment: boolean }[] };

export function printDays(checkIns: PrintCheckIn[], entries: PrintEntryRow[]): PrintDay[] {
  const days = new Map<string, PrintDay>();
  const day = (date: string) => {
    let d = days.get(date);
    if (!d) days.set(date, (d = { date, checkIn: null, entries: [] }));
    return d;
  };
  for (const c of checkIns) if (c.mood >= 1 && c.mood <= 5) day(c.local_date).checkIn = c;
  // Within a day, in the order they were written.
  for (const e of [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (e.body.trim()) day(e.entry_date).entries.push({ id: e.id, body: e.body, isMoment: e.is_moment });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
