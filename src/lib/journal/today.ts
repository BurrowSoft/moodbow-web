// Today's greeting and date line (M4). Both follow the profile's time zone,
// never the browser's or the server's: "today" is the user's local date
// (product brief §6), and get_me returns it from the database.

export type GreetingKey = "greetMorning" | "greetAfternoon" | "greetEvening";

// 05–11 morning, 12–17 afternoon, 18–04 evening.
export function greetingKey(hour: number): GreetingKey {
  if (hour >= 5 && hour <= 11) return "greetMorning";
  if (hour >= 12 && hour <= 17) return "greetAfternoon";
  return "greetEvening";
}

// The current hour (0–23) in an IANA zone; an unknown zone falls back to UTC.
export function localHour(timeZone: string, now: Date = new Date()): number {
  const format = (tz: string) =>
    Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now));
  try {
    return format(timeZone);
  } catch {
    return format("UTC");
  }
}

// The locale's own long date, never assembled by hand (decision 34). The
// spec's English is the day-first order ("Friday, 2 October 2026"), which
// is CLDR's en-GB; plain "en" would give "Friday, October 2, 2026". Thai
// uses its default Buddhist calendar ("วันศุกร์ที่ 2 ตุลาคม 2569").
const DATE_LOCALES: Record<string, string> = { en: "en-GB" };

// The date line for a YYYY-MM-DD local date (the date itself, formatted at
// noon UTC so no zone can shift it to another day).
export function dateLine(localDate: string, locale: string): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  return new Intl.DateTimeFormat(DATE_LOCALES[locale] ?? locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
