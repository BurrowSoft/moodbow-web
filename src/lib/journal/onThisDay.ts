import { flagsCrisis, type CrisisKeywords } from "@/lib/safety/crisis";

// "On this day" (1.1 A, specs/1.1-features.md): a quiet card at the top of
// the Timeline for a moment (★) from exactly 1 month, 6 months or a year ago
// today. Moments only, never more than one card; never an entry the crisis
// matcher flags, so a hard day doesn't resurface uninvited.

export type OnThisDayKind = "year" | "sixMonths" | "month";

// The rarer anniversary wins when several match.
const KINDS: { kind: OnThisDayKind; months: number }[] = [
  { kind: "year", months: 12 },
  { kind: "sixMonths", months: 6 },
  { kind: "month", months: 1 },
];

// The same day of the month, months earlier, or null when that day doesn't
// exist (no "a month ago" for Feb 31: no rounding to another day).
export function monthsBefore(isoDate: string, months: number): string | null {
  const [y, m, d] = isoDate.split("-").map(Number);
  const total = y * 12 + (m - 1) - months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (d > daysInMonth) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// The dates to look at for today (the profile's), in priority order.
export function onThisDayDates(today: string): { kind: OnThisDayKind; date: string }[] {
  return KINDS.flatMap(({ kind, months }) => {
    const date = monthsBefore(today, months);
    return date ? [{ kind, date }] : [];
  });
}

export type MomentRow = { id: string; entry_date: string; body: string; is_moment: boolean; created_at: string };

// The one card, if any: the first date (by priority) with a moment that the
// crisis matcher doesn't flag; within a day, the newest.
export function pickOnThisDay(rows: MomentRow[], today: string, keywords: CrisisKeywords | null): { kind: OnThisDayKind; entry: MomentRow } | null {
  for (const { kind, date } of onThisDayDates(today)) {
    const entry = rows
      .filter((r) => r.is_moment && r.entry_date === date && !flagsCrisis(r.body, keywords))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (entry) return { kind, entry };
  }
  return null;
}
