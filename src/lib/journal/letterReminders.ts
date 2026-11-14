// Letters to future me: up to 3 reminders, like alarms (Vitor, 14 Nov; spec "Letters to future me:
// up to 3 reminders"). Stored with the letter (letters.reminders, moodbow-app migration 033), so the
// app on any phone schedules them; the web sends nothing itself. The same rules as letter_save
// (the Mobile Dev, 14 Nov): at most 4 entries of exactly {days_before, time, on}; days_before a whole
// number 0–366, each value once (0 = the opening day); time exactly "HH:MM" (24 h); on a boolean;
// [] allowed; a heads-up is refused when days_before >= opens_on - today. NULL means the default:
// the opening day at 09:00, on.

export type LetterReminder = { days_before: number; time: string; on: boolean };

export const MAX_HEADS_UPS = 3;
export const DEFAULT_REMINDERS: LetterReminder[] = [{ days_before: 0, time: "09:00", on: true }];
// A heads-up's choices (UX, boards 26/26b v54): 1 day, 1 week, 2 weeks, 1 month before. The server
// takes any whole number of days (an app may save others; they're shown as "{n} days before").
export const QUICK_DAYS = [1, 7, 14, 30] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);

// The opening day as the server computes it: today plus N months, clamped to the month's last day
// (Postgres: 2026-01-31 + 1 month = 2026-02-28).
export function opensOn(today: string, months: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return iso(target);
}

export function daysUntil(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

// The server's rule, here first so the editor never sends what letter_save would refuse.
export function remindersValid(list: LetterReminder[], today: string, opens: string): boolean {
  if (!Array.isArray(list) || list.length > MAX_HEADS_UPS + 1) return false;
  // At most 3 heads-ups before the day, whether or not the day itself is in the list (UX, #319).
  if (list.filter((r) => r && typeof r === "object" && typeof r.days_before === "number" && r.days_before > 0).length > MAX_HEADS_UPS) return false;
  const until = daysUntil(today, opens);
  const seen = new Set<number>();
  for (const r of list) {
    if (!r || typeof r !== "object" || Object.keys(r).sort().join() !== "days_before,on,time") return false;
    if (!Number.isInteger(r.days_before) || r.days_before < 0 || r.days_before > 366 || seen.has(r.days_before)) return false;
    if (typeof r.time !== "string" || !TIME.test(r.time) || typeof r.on !== "boolean") return false;
    if (r.days_before > 0 && r.days_before >= until) return false;
    seen.add(r.days_before);
  }
  return true;
}

// The heads-ups a letter opening on that day can still have: under the days left until it opens.
export const headsUpFits = (days: number, today: string, opens: string) => Number.isInteger(days) && days >= 1 && days < daysUntil(today, opens);
