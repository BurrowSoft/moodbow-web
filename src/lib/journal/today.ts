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

const supported = (tag: string) => {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(tag).length > 0;
  } catch {
    return false;
  }
};

// Whose date order to use (decision 89): the browser's own locale for the
// UI language (Accept-Language: en-US → "Friday, October 2, 2026", en-GB /
// en-AU → "Friday, 2 October 2026"), else the profile's country, else
// en-US for English. Thai uses its default Buddhist calendar
// ("วันศุกร์ที่ 2 ตุลาคม 2569").
export function dateLocale(uiLocale: string, acceptLanguage: string | null, country: string | null): string {
  const lang = uiLocale.split("-")[0].toLowerCase();
  const tags = (acceptLanguage ?? "")
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.trim().slice(2) ?? 1);
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0, i };
    })
    .filter((t) => t.tag && t.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  const browser = tags.find(({ tag }) => {
    const [l, region] = tag.split("-");
    return l.toLowerCase() === lang && /^[a-z]{2}$|^\d{3}$/i.test(region ?? "") && supported(tag);
  });
  // Only language-region: an extension (-u-ca-…, -u-nu-…) in the header
  // must not switch the calendar or the digits.
  const tag = browser
    ? browser.tag.split("-").slice(0, 2).join("-")
    : country && /^[a-z]{2}$/i.test(country) && supported(`${lang}-${country.toUpperCase()}`)
      ? `${lang}-${country.toUpperCase()}`
      : lang === "en"
        ? "en-US"
        : lang;
  // Thai UI dates are always Buddhist era (พ.ศ., decision 193), whatever
  // the region: th-TH already is, but th-US would be Gregorian. Storage,
  // exports and file names never come through here: they stay Gregorian.
  return lang === "th" ? `${tag}-u-ca-buddhist` : tag;
}

// The date line for a YYYY-MM-DD local date in the locale's own long form,
// never assembled by hand (decision 34). Formatted at noon UTC so no zone
// can shift the date itself to another day.
export function dateLine(localDate: string, dateLocaleTag: string): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  return new Intl.DateTimeFormat(dateLocaleTag, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
