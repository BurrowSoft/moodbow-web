import contract from "../../../content/appointment.json";
import { roundFor, series, type InsightRow, type Metric } from "./insights";

// For my appointment (1.2; content/appointment.json, the rules both clients run).
export const APPOINTMENT_RULES = contract.rules;
export type Weeks = 2 | 4 | 12;

const DAY_MS = 86_400_000;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);

// The range's days, oldest first, ending on today (the saved zone's).
export function weeksDays(today: string, weeks: Weeks): string[] {
  const end = toTime(today);
  return Array.from({ length: weeks * 7 }, (_, i) => toDate(end - (weeks * 7 - 1 - i) * DAY_MS));
}

// Check-ins in the range: a count, never "of N days" (the Reviewer's read).
export const checkInCount = (rows: InsightRow[], days: string[]) => rows.filter((r) => days.includes(r.local_date)).length;

// Insights' rules: a day without a value doesn't count, and at least 3 to show anything.
export function rangeAverage(rows: InsightRow[], days: string[], metric: Metric): { points: (number | null)[]; average: number | null } {
  const points = series(rows, days, metric);
  const present = points.filter((v): v is number => v !== null);
  return { points, average: present.length >= 3 ? roundFor(metric, present.reduce((a, b) => a + b, 0) / present.length) : null };
}

// An entry's first line, up to firstLineChars, cut on a word boundary with "…".
export function firstLine(body: string): string {
  const line = (body.split(/\r?\n/).find((l) => l.trim() !== "") ?? "").trim();
  const chars = [...line];
  if (chars.length <= APPOINTMENT_RULES.firstLineChars) return line;
  const cut = chars.slice(0, APPOINTMENT_RULES.firstLineChars).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export type StarredEntry = { id: string; entry_date: string; body: string };
// Starred entries in the range, oldest first, malformed ones left out.
export function starredIn(rows: unknown, days: string[]): StarredEntry[] {
  return (Array.isArray(rows) ? rows : [])
    .filter((r): r is StarredEntry => typeof r?.id === "string" && typeof r?.body === "string" && typeof r?.entry_date === "string" && days.includes(r.entry_date))
    .sort((a, b) => (a.entry_date === b.entry_date ? a.id.localeCompare(b.id) : a.entry_date < b.entry_date ? -1 : 1));
}

// Routine (1.4 F; content/appointment.json routineCases, UX 18 Nov): only the items the person opted
// in; none, no section (null). Per item, in position order, of the range's check-in days on or
// after its started_on: the share ticked, a whole number (halves up, by integers); fewer than
// routineMinDays such days, "not enough days yet". Never a mood comparison (UX's medication
// safety ruling).
export type AppointmentRoutineItem = { id: string; position: number; in_appointment: boolean; started_on: string; ticks: readonly string[] };
export type AppointmentRoutineLine = { id: string; state: "percent"; percent: number } | { id: string; state: "not_enough" };

export function routineSection(checkInDays: readonly string[], days: string[], items: readonly AppointmentRoutineItem[]): AppointmentRoutineLine[] | null {
  const range = new Set(days);
  const inRange = [...new Set(checkInDays)].filter((d) => range.has(d));
  const opted = items.filter((i) => i.in_appointment).sort((a, b) => a.position - b.position);
  if (opted.length === 0) return null;
  return opted.map((item) => {
    const counted = inRange.filter((d) => d >= item.started_on);
    if (counted.length < APPOINTMENT_RULES.routineMinDays) return { id: item.id, state: "not_enough" };
    const ticks = new Set(item.ticks);
    const ticked = counted.filter((d) => ticks.has(d)).length;
    return { id: item.id, state: "percent", percent: Math.floor((ticked * 200 + counted.length) / (counted.length * 2)) };
  });
}
